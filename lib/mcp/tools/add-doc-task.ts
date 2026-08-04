import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { docs, workItems } from '@/lib/db/schema'
import { resolveDocAccess } from '@/lib/docs/access'
import { generateId } from '@/lib/utils/id'
import { requireMemberContext } from '../context'

const inputSchema = z.object({
  docId: z.string(),
  workItemId: z.string().describe('A work item id from list_work_items or get_work_item'),
  checked: z.boolean().optional().default(false),
})

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

// Composes two things that already exist rather than adding a new block
// type: BlockNote's built-in checkListItem (the checkbox) containing a
// workItemMention inline reference (the same live-status chip already used
// throughout docs) — a "linked task" is just those two primitives on one
// line. Appends to the top level of the document; toggle_doc_task finds it
// the same way.
export function registerAddDocTaskTool(server: McpServer) {
  server.registerTool(
    'add_doc_task',
    {
      title: 'Add linked task to document',
      description:
        'Add a checklist line to a Beacon document that references a real work item — a live status chip, not just text. Requires edit access.',
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

      const [item] = await db
        .select({ id: workItems.id, key: workItems.key, title: workItems.title, status: workItems.status })
        .from(workItems)
        .where(and(eq(workItems.id, input.workItemId), eq(workItems.workspaceId, workspaceCtx.workspaceId)))
        .limit(1)
      if (!item) return toolError('Work item not found')

      const blockId = generateId()
      const block = {
        id: blockId,
        type: 'checkListItem',
        props: { checked: input.checked },
        content: [
          {
            type: 'workItemMention',
            props: { itemId: item.id, itemKey: item.key ?? '', title: item.title, status: item.status },
          },
        ],
        children: [],
      }

      await db
        .update(docs)
        .set({ content: [...access.doc.content, block], updatedAt: new Date() })
        .where(eq(docs.id, input.docId))

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ blockId, workItemKey: item.key }) }],
      }
    },
  )
}
