import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { moveDoc } from '@/lib/docs/move'
import type { ChatToolContext } from './shared'

export function createMoveDocTool({ ctx }: ChatToolContext) {
  return tool({
    description:
      'Propose re-parenting a Beacon document — make it a sub-page of another doc, or move it to the top level. Nothing moves until the user confirms.',
    inputSchema: zodSchema(
      z.object({
        docId: z.string().describe('A doc id from list_docs'),
        parentId: z.string().nullable().describe('New parent doc id, or null to move it to the top level'),
      }),
    ),
    needsApproval: true,
    execute: async (input: { docId: string; parentId: string | null }) => {
      const result = await moveDoc(ctx, input.docId, input.parentId)
      if (!result.ok) return { error: result.error }
      return { id: result.doc.id, parentId: result.doc.parentId }
    },
  })
}
