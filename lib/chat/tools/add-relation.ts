import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { WORK_ITEM_RELATION_TYPES } from '@/lib/db/schema'
import { addRelation, RelationError } from '@/lib/work-items/relations'
import { resolveWorkItemId, type ChatToolContext } from './shared'

export function createAddRelationTool({ ctx }: ChatToolContext) {
  return tool({
    description:
      'Propose a relation between two work items — blocks, duplicate, or related. Nothing changes until the user confirms.',
    inputSchema: zodSchema(
      z.object({
        idOrKey: z.string().min(1).describe('The work item the relation is created from — id or human key'),
        relatedIdOrKey: z.string().min(1).describe('The work item being related to — id or human key'),
        type: z
          .enum(WORK_ITEM_RELATION_TYPES)
          .describe(
            '"blocks": idOrKey blocks relatedIdOrKey. "duplicate": idOrKey is a duplicate of relatedIdOrKey. "related": symmetric.',
          ),
      }),
    ),
    needsApproval: true,
    execute: async (input: {
      idOrKey: string
      relatedIdOrKey: string
      type: (typeof WORK_ITEM_RELATION_TYPES)[number]
    }) => {
      const [itemId, relatedItemId] = await Promise.all([
        resolveWorkItemId(ctx.workspaceId, input.idOrKey),
        resolveWorkItemId(ctx.workspaceId, input.relatedIdOrKey),
      ])
      if (!itemId) return { error: `No work item found matching "${input.idOrKey}"` }
      if (!relatedItemId) return { error: `No work item found matching "${input.relatedIdOrKey}"` }

      try {
        const result = await addRelation(ctx.workspaceId, itemId, relatedItemId, input.type, ctx.member.id)
        return { relationId: result.relation.id }
      } catch (error) {
        if (error instanceof RelationError) return { error: error.message }
        throw error
      }
    },
  })
}
