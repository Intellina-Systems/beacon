import 'server-only'

import { and, desc, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docCollaborators, docs, members, type DocPermission, type DocShareMode } from '@/lib/db/schema'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'

export interface MyDocRow {
  id: string
  title: string
  shareMode: DocShareMode
  updatedAt: Date
  createdAt: Date
}

export interface SharedDocRow {
  id: string
  title: string
  updatedAt: Date
  createdAt: Date
  ownerName: string
  permission: DocPermission
}

export async function listMyDocs(ctx: WorkspaceContext): Promise<MyDocRow[]> {
  return db
    .select({
      id: docs.id,
      title: docs.title,
      shareMode: docs.shareMode,
      updatedAt: docs.updatedAt,
      createdAt: docs.createdAt,
    })
    .from(docs)
    .where(and(eq(docs.workspaceId, ctx.workspaceId), eq(docs.ownerMemberId, ctx.member.id)))
    .orderBy(desc(docs.updatedAt))
}

// "Shared with me" — docs owned by someone else that the viewer can reach
// either through an explicit per-person grant or the doc's workspace-wide
// default. Merges both sources, taking the higher of the two permissions
// when a doc qualifies via both paths.
export async function listSharedDocs(ctx: WorkspaceContext): Promise<SharedDocRow[]> {
  const collabRows = await db
    .select({
      id: docs.id,
      title: docs.title,
      updatedAt: docs.updatedAt,
      createdAt: docs.createdAt,
      ownerName: members.name,
      permission: docCollaborators.permission,
    })
    .from(docCollaborators)
    .innerJoin(docs, eq(docCollaborators.docId, docs.id))
    .innerJoin(members, eq(docs.ownerMemberId, members.id))
    .where(and(eq(docs.workspaceId, ctx.workspaceId), eq(docCollaborators.memberId, ctx.member.id)))

  const workspaceRows = await db
    .select({
      id: docs.id,
      title: docs.title,
      updatedAt: docs.updatedAt,
      createdAt: docs.createdAt,
      ownerName: members.name,
      permission: docs.workspacePermission,
    })
    .from(docs)
    .innerJoin(members, eq(docs.ownerMemberId, members.id))
    .where(
      and(
        eq(docs.workspaceId, ctx.workspaceId),
        eq(docs.shareMode, 'workspace'),
        ne(docs.ownerMemberId, ctx.member.id),
      ),
    )

  const sharedMap = new Map<string, SharedDocRow>()
  for (const row of workspaceRows) sharedMap.set(row.id, row)
  for (const row of collabRows) {
    const existing = sharedMap.get(row.id)
    const permission: DocPermission =
      existing && (existing.permission === 'edit' || row.permission === 'edit') ? 'edit' : row.permission
    sharedMap.set(row.id, { ...row, permission })
  }

  return [...sharedMap.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}
