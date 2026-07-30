import { z } from 'zod'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { getActiveBlockers } from '@/lib/events/queries'
import { getMcpAuth, resolveVisibleMemberIds } from '../context'

const inputSchema = z.object({})

export function registerGetBlockersTool(server: McpServer) {
  server.registerTool(
    'get_blockers',
    {
      title: 'Get active blockers',
      description:
        'Currently active blockers — blocking events (task.blocked, agent.blocked, ci.failed…) with no later unblocking signal, plus work items sitting in blocked status.',
      inputSchema,
    },
    async (_input, ctx: ServerContext) => {
      const auth = getMcpAuth(ctx)
      const visible = await resolveVisibleMemberIds(auth.memberId)
      const blockers = await getActiveBlockers(auth.workspaceId, 14, visible)

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              blockers.map((b) => ({
                summary: b.event.summary,
                type: b.event.type,
                source: b.event.source,
                member: b.member?.name ?? null,
                workItem: b.workItem ? `${b.workItem.key ?? ''} ${b.workItem.title}`.trim() : null,
                since: b.event.occurredAt.toISOString(),
              })),
            ),
          },
        ],
      }
    },
  )
}
