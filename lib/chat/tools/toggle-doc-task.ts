import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docs } from '@/lib/db/schema'
import { resolveDocAccess } from '@/lib/docs/access'
import type { ChatToolContext } from './shared'

interface BlockLike {
  id?: unknown
  type?: unknown
  props?: Record<string, unknown>
}

export function createToggleDocTaskTool({ ctx }: ChatToolContext) {
  return tool({
    description:
      'Propose checking or unchecking a linked task line in a Beacon document. Requires edit access. Nothing changes until the user confirms.',
    inputSchema: zodSchema(
      z.object({
        docId: z.string(),
        blockId: z.string().describe('The checklist block id, returned by add_doc_task or found via get_doc'),
        checked: z.boolean().optional().describe('Set an explicit state; omit to toggle the current state'),
      }),
    ),
    needsApproval: true,
    execute: async (input: { docId: string; blockId: string; checked?: boolean }) => {
      const access = await resolveDocAccess(ctx, input.docId)
      if (!access) return { error: 'Document not found' }
      if (access.permission !== 'edit') return { error: "You don't have edit access to this document" }

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

      if (!found) return { error: 'Checklist block not found in this document' }

      await db.update(docs).set({ content: nextContent, updatedAt: new Date() }).where(eq(docs.id, input.docId))
      return { blockId: input.blockId, checked: nextChecked }
    },
  })
}
