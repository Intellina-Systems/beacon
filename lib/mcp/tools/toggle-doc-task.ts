import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { docs } from '@/lib/db/schema'
import { resolveDocAccess } from '@/lib/docs/access'
import { requireMemberContext } from '../context'

const inputSchema = z.object({
  docId: z.string(),
  blockId: z.string().describe('The checklist block id, returned by add_doc_task or found via get_doc'),
  checked: z.boolean().optional().describe('Set an explicit state; omit to toggle the current state'),
})

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

interface BlockLike {
  id?: unknown
  type?: unknown
  props?: Record<string, unknown>
}

// Checks/unchecks a checklist block by id — deliberately does not touch the
// referenced work item's own status (see lib/mcp/tools/add-doc-task.ts's
// doc comment: doc-local checked state and the item's real status are shown
// side by side, never silently forced to match). Only searches the top
// level of the document, matching where add_doc_task always appends —
// a checklist block a human nested inside a toggle list or column won't be
// found here, a known scope limit rather than an oversight.
export function registerToggleDocTaskTool(server: McpServer) {
  server.registerTool(
    'toggle_doc_task',
    {
      title: 'Toggle document task',
      description: 'Check or uncheck a linked task line in a Beacon document. Requires edit access.',
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
      if (access.permission !== 'edit') return toolError("You don't have edit access to this document")

      let found = false
      let nextChecked = false
      const nextContent = access.doc.content.map((raw) => {
        const block = raw as BlockLike
        if (!found && block && typeof block === 'object' && block.id === input.blockId) {
          found = true
          const current = Boolean(block.props?.checked)
          nextChecked = input.checked ?? !current
          return { ...block, props: { ...block.props, checked: nextChecked } }
        }
        return raw
      })

      if (!found) return toolError('Checklist block not found in this document')

      await db.update(docs).set({ content: nextContent, updatedAt: new Date() }).where(eq(docs.id, input.docId))

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ blockId: input.blockId, checked: nextChecked }) }],
      }
    },
  )
}
