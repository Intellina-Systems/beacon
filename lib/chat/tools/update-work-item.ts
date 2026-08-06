import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { updateWorkItem, WorkItemUpdateError } from '@/lib/work-items/update'
import { WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { resolveWorkItemId, type ChatToolContext } from './shared'

export function createUpdateWorkItemTool({ ctx }: ChatToolContext) {
  return tool({
    description:
      'Propose an update to a work item — status, priority, assignee, description, and more. Nothing changes until the user confirms. Reassigning to someone else is subject to the same delegation rules the web UI enforces (leads may assign within their team; everyone else may only claim or drop).',
    inputSchema: zodSchema(
      z.object({
        idOrKey: z.string().min(1).describe('A work item id, or its human key like "BEA-11"'),
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(50000).nullable().optional(),
        status: z.enum(WORK_ITEM_STATUSES).optional(),
        priority: z.number().int().min(0).max(4).optional(),
        assigneeMemberId: z
          .string()
          .nullable()
          .optional()
          .describe('A member id from list_members, or null to unassign'),
        dueDate: z
          .string()
          .nullable()
          .optional()
          .describe('ISO 8601 date, e.g. "2026-08-15", or null to clear the due date'),
      }),
    ),
    needsApproval: true,
    execute: async (input: {
      idOrKey: string
      title?: string
      description?: string | null
      status?: (typeof WORK_ITEM_STATUSES)[number]
      priority?: number
      assigneeMemberId?: string | null
      dueDate?: string | null
    }) => {
      const itemId = await resolveWorkItemId(ctx.workspaceId, input.idOrKey)
      if (!itemId) return { error: `No work item found matching "${input.idOrKey}"` }

      const { idOrKey: _idOrKey, dueDate, ...rest } = input
      let parsedDueDate: Date | null | undefined
      if (dueDate !== undefined) {
        if (dueDate === null) {
          parsedDueDate = null
        } else {
          const parsed = new Date(dueDate)
          if (Number.isNaN(parsed.getTime())) return { error: `"${dueDate}" is not a valid date` }
          parsedDueDate = parsed
        }
      }

      try {
        const { item } = await updateWorkItem(ctx, itemId, {
          ...rest,
          ...(dueDate !== undefined ? { dueDate: parsedDueDate } : {}),
        })
        return { id: item.id, key: item.key, title: item.title, status: item.status }
      } catch (error) {
        if (error instanceof WorkItemUpdateError) return { error: error.message }
        throw error
      }
    },
  })
}
