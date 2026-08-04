import 'server-only'

import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docCollaborators, docs, members, type DocPermission, type DocShareMode } from '@/lib/db/schema'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'
import { rankAfter } from '@/lib/work-items/rank'
import { resolveDocAccess } from './access'

export interface DocTreeNode {
  id: string
  title: string
  parentId: string | null
  rank: string | null
  shareMode: DocShareMode
  ownerMemberId: string
  ownerName: string
  isMine: boolean
  permission: DocPermission
  updatedAt: Date
  children: DocTreeNode[]
}

function higherPermission(a: DocPermission, b: DocPermission): DocPermission {
  return a === 'edit' || b === 'edit' ? 'edit' : 'view'
}

// Every doc this member can see, regardless of owner — the unified surface
// the docs tree renders from. Mirrors lib/docs/list.ts's visibility rules
// (owned, workspace-shared, or explicitly collaborated on) but as one merged
// set instead of two separate lists, since nesting can mix ownership freely.
export async function getVisibleDocs(ctx: WorkspaceContext): Promise<DocTreeNode[]> {
  const cols = {
    id: docs.id,
    title: docs.title,
    parentId: docs.parentId,
    rank: docs.rank,
    shareMode: docs.shareMode,
    ownerMemberId: docs.ownerMemberId,
    ownerName: members.name,
    updatedAt: docs.updatedAt,
  }

  const [ownedRows, collabRows, workspaceRows] = await Promise.all([
    db
      .select(cols)
      .from(docs)
      .innerJoin(members, eq(docs.ownerMemberId, members.id))
      .where(and(eq(docs.workspaceId, ctx.workspaceId), eq(docs.ownerMemberId, ctx.member.id))),
    db
      .select({ ...cols, permission: docCollaborators.permission })
      .from(docCollaborators)
      .innerJoin(docs, eq(docCollaborators.docId, docs.id))
      .innerJoin(members, eq(docs.ownerMemberId, members.id))
      .where(and(eq(docs.workspaceId, ctx.workspaceId), eq(docCollaborators.memberId, ctx.member.id))),
    db
      .select({ ...cols, permission: docs.workspacePermission })
      .from(docs)
      .innerJoin(members, eq(docs.ownerMemberId, members.id))
      .where(
        and(
          eq(docs.workspaceId, ctx.workspaceId),
          eq(docs.shareMode, 'workspace'),
          ne(docs.ownerMemberId, ctx.member.id),
        ),
      ),
  ])

  const byId = new Map<string, DocTreeNode>()
  for (const row of ownedRows) {
    byId.set(row.id, { ...row, isMine: true, permission: 'edit', children: [] })
  }
  for (const row of workspaceRows) {
    const { permission, ...rest } = row
    byId.set(row.id, { ...rest, isMine: false, permission, children: [] })
  }
  for (const row of collabRows) {
    const { permission, ...rest } = row
    const existing = byId.get(row.id)
    byId.set(row.id, {
      ...rest,
      isMine: false,
      permission: existing ? higherPermission(existing.permission, permission) : permission,
      children: [],
    })
  }

  return [...byId.values()]
}

// Builds the nested tree from a flat visible set. A doc whose parent isn't
// in that set (a private parent you can't see, or a genuine top-level doc)
// renders as a root — never dropped, never crashes on a dangling reference.
export function buildDocTree(flat: DocTreeNode[]): DocTreeNode[] {
  const byId = new Map(flat.map((d) => [d.id, d]))
  const roots: DocTreeNode[] = []

  for (const doc of flat) {
    const parent = doc.parentId ? byId.get(doc.parentId) : undefined
    if (parent) parent.children.push(doc)
    else roots.push(doc)
  }

  const byRank = (a: DocTreeNode, b: DocTreeNode) => {
    if (a.rank && b.rank) return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0
    if (a.rank) return -1
    if (b.rank) return 1
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  }
  for (const doc of byId.values()) doc.children.sort(byRank)
  roots.sort(byRank)

  return roots
}

export async function getDocTree(ctx: WorkspaceContext): Promise<DocTreeNode[]> {
  return buildDocTree(await getVisibleDocs(ctx))
}

// Rank for a newly-appended doc among its siblings (same parentId, including
// null for top-level).
export async function nextSiblingRank(workspaceId: string, parentId: string | null): Promise<string> {
  // Explicit NULLS LAST: Postgres's default for DESC is NULLS FIRST, which
  // would hand back a null-ranked legacy row instead of the real highest
  // rank whenever the two are mixed among the same siblings.
  const [last] = await db
    .select({ rank: docs.rank })
    .from(docs)
    .where(and(eq(docs.workspaceId, workspaceId), parentId ? eq(docs.parentId, parentId) : isNull(docs.parentId)))
    .orderBy(sql`${docs.rank} DESC NULLS LAST`)
    .limit(1)
  return rankAfter(last?.rank ?? null)
}

// Every doc id/parentId pair in the workspace — deliberately just these two
// columns (cheap) for walking ancestor chains, independent of what's
// "visible" to a particular viewer (a move's new parent might sit under a
// private doc the mover can't see the contents of, but the chain still needs
// walking correctly to catch a cycle).
export async function getParentMap(workspaceId: string): Promise<{ id: string; parentId: string | null }[]> {
  return db.select({ id: docs.id, parentId: docs.parentId }).from(docs).where(eq(docs.workspaceId, workspaceId))
}

export interface DocAncestor {
  id: string
  title: string
}

// Ancestor chain for a doc's breadcrumb, root-first (nearest ancestor last,
// immediately before the current doc). Stops at the first ancestor the
// viewer doesn't themselves have access to — a sub-page can be shared
// directly without its parent being shared too, and the breadcrumb must not
// leak a private ancestor's title (same rule resolveDocAccess enforces for
// the doc itself: never reveal whether an inaccessible doc exists).
export async function getAncestors(ctx: WorkspaceContext, docId: string): Promise<DocAncestor[]> {
  const chain: DocAncestor[] = []
  let currentId: string | null = docId
  const seen = new Set<string>()

  for (let i = 0; i < 50; i++) {
    if (!currentId || seen.has(currentId)) break
    seen.add(currentId)
    const access = await resolveDocAccess(ctx, currentId)
    if (!access) break
    if (access.doc.id !== docId) chain.unshift({ id: access.doc.id, title: access.doc.title })
    currentId = access.doc.parentId
  }

  return chain
}

// Would setting `docId`'s parent to `newParentId` create a cycle (moving a
// doc under itself or under one of its own descendants)?
export function wouldCreateCycle(
  allDocs: { id: string; parentId: string | null }[],
  docId: string,
  newParentId: string,
): boolean {
  if (docId === newParentId) return true
  const byId = new Map(allDocs.map((d) => [d.id, d]))
  const seen = new Set<string>()
  let current: string | null | undefined = newParentId
  while (current) {
    if (current === docId) return true
    if (seen.has(current)) return false // pre-existing cycle elsewhere — not this move's problem
    seen.add(current)
    current = byId.get(current)?.parentId
  }
  return false
}
