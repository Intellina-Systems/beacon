import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { workItems } from '@/lib/db/schema'
import { ingestEvents } from '@/lib/events/ingest'
import { syncCommentToGithub } from '@/lib/github/issue-sync'
import { addWatchers } from './watchers'
import { createComment, listComments, type CommentRecord } from './comment-store'

export { type CommentRecord, listComments, createComment, getComment, updateComment, deleteComment } from './comment-store'

export class CommentError extends Error {}

// Bundles the full "post a comment" side effects — create, auto-subscribe
// the author, emit `task.commented`, push to a linked GitHub Issue if one
// exists — used by both the HTTP route and MCP tools so the two never drift
// apart on what commenting actually does.
export async function postComment(input: {
  workspaceId: string
  workItemId: string
  authorMemberId: string
  authorName: string
  body: string
}): Promise<{ comment: CommentRecord | null; comments: CommentRecord[] }> {
  const [item] = await db
    .select({
      id: workItems.id,
      key: workItems.key,
      title: workItems.title,
      externalProvider: workItems.externalProvider,
      externalId: workItems.externalId,
    })
    .from(workItems)
    .where(and(eq(workItems.id, input.workItemId), eq(workItems.workspaceId, input.workspaceId)))
    .limit(1)
  if (!item) throw new CommentError('Work item not found')

  const comment = await createComment({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    authorMemberId: input.authorMemberId,
    body: input.body,
  })

  // Commenting subscribes you, then the event fans out to everyone else
  // watching — same path assignment and status changes take.
  await addWatchers(input.workspaceId, input.workItemId, [{ memberId: input.authorMemberId, reason: 'manual' }])
  await ingestEvents(
    [
      {
        type: 'task.commented',
        source: 'manual',
        summary: `${input.authorName} commented on ${item.key ?? item.title}`,
        task: input.workItemId,
        engineer: input.authorName,
        externalId: `workitem:${input.workItemId}:comment:${comment.id}`,
        payload: { commentId: comment.id },
      },
    ],
    { workspaceId: input.workspaceId },
  )

  // Best-effort: push the comment to a linked GitHub Issue, if any.
  if (item.externalProvider === 'github' && item.externalId) {
    await syncCommentToGithub({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      externalId: item.externalId,
      authorName: input.authorName,
      body: input.body,
    })
  }

  const comments = await listComments(input.workspaceId, input.workItemId)
  return { comment: comments.find((c) => c.id === comment.id) ?? null, comments }
}
