import { z } from 'zod'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { resolveDocAccess } from '@/lib/docs/access'
import { blocksToMarkdown } from '@/lib/docs/markdown'
import { requireMemberContext } from '../context'

const inputSchema = z.object({
  docId: z.string().describe('A doc id from list_docs, create_doc, or search_knowledge'),
})

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

export function registerGetDocTool(server: McpServer) {
  server.registerTool(
    'get_doc',
    {
      title: 'Get document',
      description: 'Fetch a Beacon document’s content as markdown, along with its title and where it sits in the doc tree.',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      let workspaceCtx
      try {
        workspaceCtx = await requireMemberContext(ctx)
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Not authorized')
      }

      const access = await resolveDocAccess(workspaceCtx, input.docId)
      if (!access) return toolError('Document not found')

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              id: access.doc.id,
              title: access.doc.title,
              parentId: access.doc.parentId,
              permission: access.permission,
              content: blocksToMarkdown(access.doc.content),
            }),
          },
        ],
      }
    },
  )
}
