import { z } from 'zod'
import { and, eq, or } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { workItems } from '@/lib/db/schema'
import { postComment, CommentError } from '@/lib/work-items/comments'
import { requireMemberContext } from '../context'

const inputSchema = z.object({
  idOrKey: z.string().min(1).describe('A work item id, or its human key like "BEA-11"'),
  body: z.string().trim().min(1).max(20000).describe('Markdown supported'),
})

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

export function registerAddCommentTool(server: McpServer) {
  server.registerTool(
    'add_comment',
    {
      title: 'Add comment',
      description:
        'Post a comment on a work item. Requires a connected member (not a bare API key) — the comment is attributed to that person, the same as posting from the web UI.',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      let workspaceCtx
      try {
        workspaceCtx = await requireMemberContext(ctx)
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Not authorized')
      }

      const [row] = await db
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            eq(workItems.workspaceId, workspaceCtx.workspaceId),
            or(eq(workItems.id, input.idOrKey), eq(workItems.key, input.idOrKey.toUpperCase())),
          ),
        )
        .limit(1)
      if (!row) return toolError(`No work item found matching "${input.idOrKey}"`)

      try {
        const { comment } = await postComment({
          workspaceId: workspaceCtx.workspaceId,
          workItemId: row.id,
          authorMemberId: workspaceCtx.member.id,
          authorName: workspaceCtx.member.name,
          body: input.body,
        })
        return { content: [{ type: 'text' as const, text: JSON.stringify({ commentId: comment?.id ?? null }) }] }
      } catch (error) {
        if (error instanceof CommentError) return toolError(error.message)
        throw error
      }
    },
  )
}
