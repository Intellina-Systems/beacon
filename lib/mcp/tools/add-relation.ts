import { z } from 'zod'
import { and, eq, or } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { workItems, WORK_ITEM_RELATION_TYPES } from '@/lib/db/schema'
import { addRelation, RelationError } from '@/lib/work-items/relations'
import { requireMemberContext } from '../context'

const inputSchema = z.object({
  idOrKey: z.string().min(1).describe('The work item the relation is created from — id or human key'),
  relatedIdOrKey: z.string().min(1).describe('The work item being related to — id or human key'),
  type: z
    .enum(WORK_ITEM_RELATION_TYPES)
    .describe(
      '"blocks": idOrKey blocks relatedIdOrKey. "duplicate": idOrKey is a duplicate of relatedIdOrKey. "related": symmetric.',
    ),
})

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

async function resolveId(workspaceId: string, idOrKey: string): Promise<string | null> {
  const [row] = await db
    .select({ id: workItems.id })
    .from(workItems)
    .where(
      and(
        eq(workItems.workspaceId, workspaceId),
        or(eq(workItems.id, idOrKey), eq(workItems.key, idOrKey.toUpperCase())),
      ),
    )
    .limit(1)
  return row?.id ?? null
}

export function registerAddRelationTool(server: McpServer) {
  server.registerTool(
    'add_relation',
    {
      title: 'Relate work items',
      description:
        'Create a relation between two work items — blocks, duplicate, or related. Requires a connected member.',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      let workspaceCtx
      try {
        workspaceCtx = await requireMemberContext(ctx)
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Not authorized')
      }

      const [itemId, relatedItemId] = await Promise.all([
        resolveId(workspaceCtx.workspaceId, input.idOrKey),
        resolveId(workspaceCtx.workspaceId, input.relatedIdOrKey),
      ])
      if (!itemId) return toolError(`No work item found matching "${input.idOrKey}"`)
      if (!relatedItemId) return toolError(`No work item found matching "${input.relatedIdOrKey}"`)

      try {
        const result = await addRelation(
          workspaceCtx.workspaceId,
          itemId,
          relatedItemId,
          input.type,
          workspaceCtx.member.id,
        )
        return { content: [{ type: 'text' as const, text: JSON.stringify({ relationId: result.relation.id }) }] }
      } catch (error) {
        if (error instanceof RelationError) return toolError(error.message)
        throw error
      }
    },
  )
}
