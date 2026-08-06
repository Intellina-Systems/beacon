import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, workItems } from '@/lib/db/schema'
import { listEvents } from '@/lib/events/queries'
import type { ChatToolContext } from './shared'

export function createGetWorkItemTool({ workspaceId }: ChatToolContext) {
  return tool({
    description: 'Fetch one work item by id or key, with its description and recent activity.',
    inputSchema: zodSchema(
      z.object({ idOrKey: z.string().min(1).describe('A work item id, or its human key like "BEA-11"') }),
    ),
    execute: async (input: { idOrKey: string }) => {
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
            eq(workItems.workspaceId, workspaceId),
            or(eq(workItems.id, input.idOrKey), eq(workItems.key, input.idOrKey.toUpperCase())),
          ),
        )
        .limit(1)

      if (!row) return { error: `No work item found matching "${input.idOrKey}"` }

      const events = await listEvents(workspaceId, { workItemId: row.id, limit: 20 })
      return {
        ...row,
        dueDate: row.dueDate?.toISOString() ?? null,
        recentActivity: events.map((e) => ({
          type: e.type,
          summary: e.summary,
          actor: e.memberName ?? e.actorLabel,
          occurredAt: e.occurredAt.toISOString(),
        })),
      }
    },
  })
}
