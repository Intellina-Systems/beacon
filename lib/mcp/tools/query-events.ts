import { z } from 'zod'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { EVENT_SOURCES, type Event } from '@/lib/db/schema'
import { listEvents } from '@/lib/events/queries'
import { getMcpAuth, resolveVisibleMemberIds } from '../context'

const inputSchema = z.object({
  sinceDays: z.number().int().min(1).max(90).default(7),
  source: z.enum(EVENT_SOURCES).optional(),
  types: z.array(z.string()).optional().describe('Dot-namespaced event types, e.g. ["pr.merged", "ci.failed"]'),
  limit: z.number().int().min(1).max(200).default(50),
})

export function registerQueryEventsTool(server: McpServer) {
  server.registerTool(
    'query_events',
    {
      title: 'Query events',
      description:
        "Query Beacon's raw event stream — commits, PRs, CI, agent runs, task changes — filtered by time range, source, or event type.",
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      const auth = getMcpAuth(ctx)
      const visible = await resolveVisibleMemberIds(auth.memberId)
      const rows = await listEvents(auth.workspaceId, {
        sinceDays: input.sinceDays,
        source: input.source as Event['source'] | undefined,
        types: input.types,
        limit: input.limit,
        visibleMemberIds: visible,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              rows.map((row) => ({
                source: row.source,
                type: row.type,
                summary: row.summary,
                actor: row.memberName ?? row.actorLabel,
                workItem: row.workItemKey,
                occurredAt: row.occurredAt.toISOString(),
              })),
            ),
          },
        ],
      }
    },
  )
}
