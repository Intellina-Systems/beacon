import 'server-only'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docCollaborators, docs, type Doc } from '@/lib/db/schema'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'
import { generateId } from '@/lib/utils/id'
import { nextSiblingRank } from './tree'

// Creates a doc, optionally as a sub-page. When nested, the new doc inherits
// its parent's sharing (shareMode/workspacePermission + a copy of its
// per-member collaborator grants) at creation time — a snapshot, not a live
// link, so it stays independently editable afterward. Matches Notion's own
// "inherited at creation, overridable after" behavior. Caller is responsible
// for verifying edit access to parentId before calling this (see the POST
// route, which checks via resolveDocAccess).
export async function createDoc(
  ctx: WorkspaceContext,
  options: { parentId?: string | null; title?: string; content?: unknown[] } = {},
): Promise<Doc> {
  const parentId = options.parentId ?? null
  const rank = await nextSiblingRank(ctx.workspaceId, parentId)

  let parent: Doc | null = null
  if (parentId) {
    const [row] = await db.select().from(docs).where(eq(docs.id, parentId)).limit(1)
    parent = row ?? null
  }

  const [doc] = await db
    .insert(docs)
    .values({
      id: generateId(),
      workspaceId: ctx.workspaceId,
      ownerMemberId: ctx.member.id,
      parentId,
      rank,
      title: options.title?.trim() || 'Untitled',
      content: options.content ?? [],
      ...(parent ? { shareMode: parent.shareMode, workspacePermission: parent.workspacePermission } : {}),
    })
    .returning()

  if (parentId) {
    const parentCollaborators = await db.select().from(docCollaborators).where(eq(docCollaborators.docId, parentId))
    if (parentCollaborators.length > 0) {
      await db.insert(docCollaborators).values(
        parentCollaborators.map((c) => ({
          id: generateId(),
          docId: doc.id,
          memberId: c.memberId,
          permission: c.permission,
          addedByMemberId: c.addedByMemberId,
        })),
      )
    }
  }

  return doc
}
