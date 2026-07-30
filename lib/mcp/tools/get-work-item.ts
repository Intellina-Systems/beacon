import { z } from 'zod'
import { and, eq, or } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { members, workItems } from '@/lib/db/schema'
import { listEvents } from '@/lib/events/queries'
import { getMcpAuth } from '../context'

const inputSchema = z.object({
  idOrKey: z.string().min(1).describe('A work item id, or its human key like "BEA-11"'),
})

export function registerGetWorkItemTool(server: McpServer) {
  server.registerTool(
    'get_work_item',
    {
      title: 'Get work item',
      description: 'Fetch one work item by id or key, with its description and recent activity.',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      const auth = getMcpAuth(ctx)
      const [row] = await db
        .select({
          id: workItems.id,
          key: workItems.key,
          title: workItems.title,
          description: workItems.description,
          kind: workItems.kind,
          status: workItems.status,
          priority: workItems.priority,
          assigneeMemberId: workItems.assigneeMemberId,
          assigneeName: members.name,
          labels: workItems.labels,
          dueDate: workItems.dueDate,
          projectId: workItems.projectId,
          externalUrl: workItems.externalUrl,
        })
        .from(workItems)
        .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
        .where(
          and(
            eq(workItems.workspaceId, auth.workspaceId),
            or(eq(workItems.id, input.idOrKey), eq(workItems.key, input.idOrKey.toUpperCase())),
          ),
        )
        .limit(1)

      if (!row) {
        return {
          content: [{ type: 'text' as const, text: `No work item found matching "${input.idOrKey}"` }],
          isError: true,
        }
      }

      const events = await listEvents(auth.workspaceId, { workItemId: row.id, limit: 20 })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              id: row.id,
              key: row.key,
              title: row.title,
              description: row.description,
              kind: row.kind,
              status: row.status,
              priority: row.priority,
              assigneeMemberId: row.assigneeMemberId,
              assigneeName: row.assigneeName,
              labels: row.labels,
              dueDate: row.dueDate?.toISOString() ?? null,
              projectId: row.projectId,
              externalUrl: row.externalUrl,
              recentActivity: events.map((e) => ({
                type: e.type,
                summary: e.summary,
                actor: e.memberName ?? e.actorLabel,
                occurredAt: e.occurredAt.toISOString(),
              })),
            }),
          },
        ],
      }
    },
  )
}
