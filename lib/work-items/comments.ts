import 'server-only'

import { and, asc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { members, workItemComments } from '@/lib/db/schema'

export interface CommentRecord {
  id: string
  body: string
  authorMemberId: string | null
  authorName: string | null
  authorAvatarUrl: string | null
  createdAt: Date
  editedAt: Date | null
}

export async function listComments(workspaceId: string, workItemId: string): Promise<CommentRecord[]> {
  return db
    .select({
      id: workItemComments.id,
      body: workItemComments.body,
      authorMemberId: workItemComments.authorMemberId,
      authorName: members.name,
      authorAvatarUrl: members.avatarUrl,
      createdAt: workItemComments.createdAt,
      editedAt: workItemComments.editedAt,
    })
    .from(workItemComments)
    .leftJoin(members, eq(members.id, workItemComments.authorMemberId))
    .where(and(eq(workItemComments.workspaceId, workspaceId), eq(workItemComments.workItemId, workItemId)))
    .orderBy(asc(workItemComments.createdAt))
}

export async function createComment(input: {
  workspaceId: string
  workItemId: string
  authorMemberId: string
  body: string
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(workItemComments)
    .values({
      id: nanoid(),
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      authorMemberId: input.authorMemberId,
      body: input.body,
    })
    .returning({ id: workItemComments.id })
  return row
}

export async function getComment(workspaceId: string, commentId: string) {
  const [row] = await db
    .select({
      id: workItemComments.id,
      workItemId: workItemComments.workItemId,
      authorMemberId: workItemComments.authorMemberId,
    })
    .from(workItemComments)
    .where(and(eq(workItemComments.id, commentId), eq(workItemComments.workspaceId, workspaceId)))
    .limit(1)
  return row ?? null
}

export async function updateComment(workspaceId: string, commentId: string, body: string): Promise<void> {
  const now = new Date()
  await db
    .update(workItemComments)
    .set({ body, editedAt: now, updatedAt: now })
    .where(and(eq(workItemComments.id, commentId), eq(workItemComments.workspaceId, workspaceId)))
}

export async function deleteComment(workspaceId: string, commentId: string): Promise<boolean> {
  const deleted = await db
    .delete(workItemComments)
    .where(and(eq(workItemComments.id, commentId), eq(workItemComments.workspaceId, workspaceId)))
    .returning({ id: workItemComments.id })
  return deleted.length > 0
}
