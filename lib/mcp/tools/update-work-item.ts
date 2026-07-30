import { z } from 'zod'
import { and, eq, or } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { workItems, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { updateWorkItem, WorkItemUpdateError } from '@/lib/work-items/update'
import { requireMemberContext } from '../context'

const inputSchema = z.object({
  idOrKey: z.string().min(1).describe('A work item id, or its human key like "BEA-11"'),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(50000).nullable().optional(),
  status: z.enum(WORK_ITEM_STATUSES).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  assigneeMemberId: z.string().nullable().optional().describe('A member id from list_members, or null to unassign'),
  labels: z.array(z.string()).max(20).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  estimate: z.number().min(0).max(1000).nullable().optional(),
  projectId: z.string().optional().describe('A project id from list_projects'),
})

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

export function registerUpdateWorkItemTool(server: McpServer) {
  server.registerTool(
    'update_work_item',
    {
      title: 'Update work item',
      description:
        'Update a work item — status, priority, assignee, description, and more. Requires a connected member (not a bare API key). Reassigning to someone else is subject to the same delegation rules the web UI enforces (leads may assign within their team; everyone else may only claim or drop).',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      let workspaceCtx
      try {
        workspaceCtx = await requireMemberContext(ctx)
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Not authorized')
      }

      const [row] = await db
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            eq(workItems.workspaceId, workspaceCtx.workspaceId),
            or(eq(workItems.id, input.idOrKey), eq(workItems.key, input.idOrKey.toUpperCase())),
          ),
        )
        .limit(1)
      if (!row) return toolError(`No work item found matching "${input.idOrKey}"`)

      const { idOrKey: _idOrKey, ...fields } = input
      if (Object.keys(fields).length === 0) return toolError('No fields to update were given')

      try {
        const { item } = await updateWorkItem(workspaceCtx, row.id, fields)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ id: item.id, key: item.key, title: item.title, status: item.status }),
            },
          ],
        }
      } catch (error) {
        if (error instanceof WorkItemUpdateError) return toolError(error.message)
        throw error
      }
    },
  )
}
