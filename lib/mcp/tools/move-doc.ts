import { z } from 'zod'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { moveDoc } from '@/lib/docs/move'
import { requireMemberContext } from '../context'

const inputSchema = z.object({
  docId: z.string().describe('A doc id from list_docs'),
  parentId: z.string().nullable().describe('New parent doc id, or null to move it to the top level'),
})

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

export function registerMoveDocTool(server: McpServer) {
  server.registerTool(
    'move_doc',
    {
      title: 'Move document',
      description: 'Re-parent a Beacon document — make it a sub-page of another doc, or move it to the top level.',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      let workspaceCtx
      try {
        workspaceCtx = await requireMemberContext(ctx)
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Not authorized')
      }

      const result = await moveDoc(workspaceCtx, input.docId, input.parentId)
      if (!result.ok) return toolError(result.error)

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ id: result.doc.id, parentId: result.doc.parentId }) },
        ],
      }
    },
  )
}
