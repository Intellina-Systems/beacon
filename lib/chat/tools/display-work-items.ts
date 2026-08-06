import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { workItems, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { PRIORITY_LABEL } from '@/lib/work-items/constants'
import type { ChatToolContext } from './shared'

export function createDisplayWorkItemsTool({ workspaceId, visible, memberById }: ChatToolContext) {
  return tool({
    description:
      'Display work items as visual cards with status, priority, and assignee. Only use when the user explicitly asks to see/show/list the tasks, backlog, or work items as a board — not for conversational questions about what someone is working on, which should be answered in prose instead.',
    inputSchema: zodSchema(
      z.object({
        statuses: z
          .array(z.enum(WORK_ITEM_STATUSES))
          .optional()
          .describe('Statuses to include. Defaults to active work (todo, in_progress, in_review, blocked).'),
        assigneeName: z.string().optional().describe('Filter to one engineer by name'),
      }),
    ),
    execute: async (input: { statuses?: string[]; assigneeName?: string }) => {
      const statuses = input.statuses?.length ? input.statuses : ['todo', 'in_progress', 'in_review', 'blocked']
      const assignee = input.assigneeName
        ? [...memberById.values()].find((member) =>
            member.name.toLowerCase().includes(input.assigneeName!.toLowerCase()),
          )
        : undefined

      const rows = await db
        .select({
          id: workItems.id,
          key: workItems.key,
          title: workItems.title,
          description: workItems.description,
          status: workItems.status,
          priority: workItems.priority,
          assigneeMemberId: workItems.assigneeMemberId,
          dueDate: workItems.dueDate,
          externalUrl: workItems.externalUrl,
        })
        .from(workItems)
        .where(
          and(
            eq(workItems.workspaceId, workspaceId),
            inArray(workItems.status, statuses as never),
            assignee ? eq(workItems.assigneeMemberId, assignee.id) : undefined,
            visible
              ? or(
                  inArray(workItems.assigneeMemberId, visible.length ? visible : ['__none__']),
                  isNull(workItems.assigneeMemberId),
                )
              : undefined,
          ),
        )
        .orderBy(desc(workItems.updatedAt))
        .limit(50)

      return {
        items: rows.map((item) => ({
          id: item.id,
          identifier: item.key ?? '',
          title: item.title,
          description: item.description,
          status: item.status,
          priority: item.priority,
          priorityLabel: item.priority != null ? (PRIORITY_LABEL[item.priority] ?? 'none') : 'none',
          assigneeName: item.assigneeMemberId ? (memberById.get(item.assigneeMemberId)?.name ?? null) : null,
          dueDate: item.dueDate?.toISOString() ?? null,
          url: item.externalUrl,
        })),
      }
    },
  })
}
