import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { workItems, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import type { ChatToolContext } from './shared'

export function createListWorkItemsTool({ workspaceId, visible }: ChatToolContext) {
  return tool({
    description: 'List work items filtered by status and/or assignee, most recently updated first.',
    inputSchema: zodSchema(
      z.object({
        statuses: z
          .array(z.enum(WORK_ITEM_STATUSES))
          .optional()
          .describe('Defaults to active work: todo, in_progress, in_review, blocked.'),
        assigneeMemberId: z.string().optional().describe('A member id from list_members'),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    ),
    execute: async (input: { statuses?: string[]; assigneeMemberId?: string; limit: number }) => {
      const statuses = input.statuses?.length ? input.statuses : ['todo', 'in_progress', 'in_review', 'blocked']
      const rows = await db
        .select({
          id: workItems.id,
          key: workItems.key,
          title: workItems.title,
          status: workItems.status,
          priority: workItems.priority,
          assigneeMemberId: workItems.assigneeMemberId,
          dueDate: workItems.dueDate,
        })
        .from(workItems)
        .where(
          and(
            eq(workItems.workspaceId, workspaceId),
            inArray(workItems.status, statuses as never),
            input.assigneeMemberId ? eq(workItems.assigneeMemberId, input.assigneeMemberId) : undefined,
            visible
              ? or(
                  inArray(workItems.assigneeMemberId, visible.length ? visible : ['__none__']),
                  isNull(workItems.assigneeMemberId),
                )
              : undefined,
          ),
        )
        .orderBy(desc(workItems.updatedAt))
        .limit(input.limit)

      return {
        items: rows.map((r) => ({
          id: r.id,
          key: r.key,
          title: r.title,
          status: r.status,
          priority: r.priority,
          assigneeMemberId: r.assigneeMemberId,
          dueDate: r.dueDate?.toISOString() ?? null,
        })),
      }
    },
  })
}
