import { z } from 'zod'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { createDoc } from '@/lib/docs/create'
import { resolveDocAccess } from '@/lib/docs/access'
import { markdownToBlocks } from '@/lib/docs/markdown'
import { requireMemberContext } from '../context'

const inputSchema = z.object({
  title: z.string().min(1).max(300),
  content: z
    .string()
    .max(50000)
    .optional()
    .describe(
      'Markdown content. Supports headings (#), bullet/numbered/check lists (-, 1., - [ ]), quotes (>), dividers (---), and inline **bold**/*italic*/`code`.',
    ),
  parentId: z
    .string()
    .optional()
    .describe('A doc id from list_docs — creates this as a sub-page, inheriting its sharing from the parent'),
})

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

export function registerCreateDocTool(server: McpServer) {
  server.registerTool(
    'create_doc',
    {
      title: 'Create document',
      description: 'Create a new Beacon document (block-based, shareable, nestable). Requires a connected member.',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      let workspaceCtx
      try {
        workspaceCtx = await requireMemberContext(ctx)
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Not authorized')
      }

      if (input.parentId) {
        const parentAccess = await resolveDocAccess(workspaceCtx, input.parentId)
        if (!parentAccess) return toolError('Parent document not found')
        if (parentAccess.permission !== 'edit') {
          return toolError("You don't have edit access to that parent document")
        }
      }

      const doc = await createDoc(workspaceCtx, {
        parentId: input.parentId,
        title: input.title,
        content: input.content ? markdownToBlocks(input.content) : undefined,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ id: doc.id, title: doc.title, parentId: doc.parentId }),
          },
        ],
      }
    },
  )
}
