import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { EVENT_SOURCES, type Event } from '@/lib/db/schema'
import { listEvents } from '@/lib/events/queries'
import type { ChatToolContext } from './shared'

export function createQueryEventsTool({ workspaceId, visible, roster }: ChatToolContext) {
  return tool({
    description:
      'Query the raw event stream with filters — time range, source (github, agent, cicd…), event types, or a member name. Use for questions like "what happened yesterday", "what did X do this week", "any deploys?", "what merged?". Returns raw events for you to summarize in prose.',
    inputSchema: zodSchema(
      z.object({
        sinceDays: z.number().int().min(1).max(90).default(7),
        source: z.enum(EVENT_SOURCES).optional(),
        types: z.array(z.string()).optional().describe('Dot-namespaced event types, e.g. ["pr.merged", "ci.failed"]'),
        memberName: z.string().optional().describe('Filter to one engineer by name'),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    ),
    execute: async (input: {
      sinceDays: number
      source?: Event['source']
      types?: string[]
      memberName?: string
      limit: number
    }) => {
      const memberId = input.memberName
        ? roster.find((member) => member.name.toLowerCase().includes(input.memberName!.toLowerCase()))?.id
        : undefined
      const rows = await listEvents(workspaceId, {
        sinceDays: input.sinceDays,
        source: input.source,
        types: input.types,
        memberId,
        limit: input.limit,
        visibleMemberIds: visible,
      })
      return {
        events: rows.map((row) => ({
          source: row.source,
          type: row.type,
          summary: row.summary,
          actor: row.memberName ?? row.actorLabel,
          workItem: row.workItemKey,
          occurredAt: row.occurredAt.toISOString(),
        })),
      }
    },
  })
}
