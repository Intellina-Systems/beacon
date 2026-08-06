import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { postComment, CommentError } from '@/lib/work-items/comments'
import { resolveWorkItemId, type ChatToolContext } from './shared'

export function createAddCommentTool({ ctx }: ChatToolContext) {
  return tool({
    description:
      'Propose a comment on a work item, attributed to the current user. Nothing is posted until the user confirms.',
    inputSchema: zodSchema(
      z.object({
        idOrKey: z.string().min(1).describe('A work item id, or its human key like "BEA-11"'),
        body: z.string().trim().min(1).max(20000).describe('Markdown supported'),
      }),
    ),
    needsApproval: true,
    execute: async (input: { idOrKey: string; body: string }) => {
      const itemId = await resolveWorkItemId(ctx.workspaceId, input.idOrKey)
      if (!itemId) return { error: `No work item found matching "${input.idOrKey}"` }

      try {
        const { comment } = await postComment({
          workspaceId: ctx.workspaceId,
          workItemId: itemId,
          authorMemberId: ctx.member.id,
          authorName: ctx.member.name,
          body: input.body,
        })
        return { commentId: comment?.id ?? null }
      } catch (error) {
        if (error instanceof CommentError) return { error: error.message }
        throw error
      }
    },
  })
}
