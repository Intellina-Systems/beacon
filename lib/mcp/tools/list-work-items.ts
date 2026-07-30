import { z } from 'zod'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { workItems, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { getMcpAuth, resolveVisibleMemberIds } from '../context'

const inputSchema = z.object({
  statuses: z
    .array(z.enum(WORK_ITEM_STATUSES))
    .optional()
    .describe('Defaults to active work: todo, in_progress, in_review, blocked.'),
  assigneeMemberId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
})

export function registerListWorkItemsTool(server: McpServer) {
  server.registerTool(
    'list_work_items',
    {
      title: 'List work items',
      description: 'List work items filtered by status and/or assignee, most recently updated first.',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      const auth = getMcpAuth(ctx)
      const visible = await resolveVisibleMemberIds(auth.memberId)
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
            eq(workItems.workspaceId, auth.workspaceId),
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
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              rows.map((r) => ({
                id: r.id,
                key: r.key,
                title: r.title,
                status: r.status,
                priority: r.priority,
                assigneeMemberId: r.assigneeMemberId,
                dueDate: r.dueDate?.toISOString() ?? null,
              })),
            ),
          },
        ],
      }
    },
  )
}
