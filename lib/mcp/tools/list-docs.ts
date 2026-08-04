import { z } from 'zod'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { getVisibleDocs } from '@/lib/docs/tree'
import { requireMemberContext } from '../context'

const inputSchema = z.object({
  parentId: z
    .string()
    .optional()
    .describe('List only direct children of this doc id — omit to list every document visible to you'),
})

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

export function registerListDocsTool(server: McpServer) {
  server.registerTool(
    'list_docs',
    {
      title: 'List documents',
      description: 'List Beacon documents visible to you, optionally scoped to one doc’s direct sub-pages.',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      let workspaceCtx
      try {
        workspaceCtx = await requireMemberContext(ctx)
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Not authorized')
      }

      const visible = await getVisibleDocs(workspaceCtx)
      const filtered = input.parentId ? visible.filter((d) => d.parentId === input.parentId) : visible

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              filtered.map((d) => ({
                id: d.id,
                title: d.title,
                parentId: d.parentId,
                isMine: d.isMine,
                permission: d.permission,
                updatedAt: d.updatedAt,
              })),
            ),
          },
        ],
      }
    },
  )
}
