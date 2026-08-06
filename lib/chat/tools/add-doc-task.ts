import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docs, workItems } from '@/lib/db/schema'
import { resolveDocAccess } from '@/lib/docs/access'
import { generateId } from '@/lib/utils/id'
import type { ChatToolContext } from './shared'

export function createAddDocTaskTool({ ctx }: ChatToolContext) {
  return tool({
    description:
      'Propose adding a checklist line to a Beacon document that references a real work item — a live status chip, not just text. Requires edit access. Nothing changes until the user confirms.',
    inputSchema: zodSchema(
      z.object({
        docId: z.string(),
        workItemId: z.string().describe('A work item id from list_work_items or get_work_item'),
        checked: z.boolean().optional().default(false),
      }),
    ),
    needsApproval: true,
    execute: async (input: { docId: string; workItemId: string; checked?: boolean }) => {
      const access = await resolveDocAccess(ctx, input.docId)
      if (!access) return { error: 'Document not found' }
      if (access.permission !== 'edit') return { error: "You don't have edit access to this document" }

      const [item] = await db
        .select({ id: workItems.id, key: workItems.key, title: workItems.title, status: workItems.status })
        .from(workItems)
        .where(and(eq(workItems.id, input.workItemId), eq(workItems.workspaceId, ctx.workspaceId)))
        .limit(1)
      if (!item) return { error: 'Work item not found' }

      const blockId = generateId()
      const block = {
        id: blockId,
        type: 'checkListItem',
        props: { checked: input.checked ?? false },
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

      return { blockId, workItemKey: item.key }
    },
  })
}
