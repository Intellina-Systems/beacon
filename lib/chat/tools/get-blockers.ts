import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import type { ChatToolContext } from './shared'

export function createGetBlockersTool({ blockers }: ChatToolContext) {
  return tool({
    description:
      'Return the currently active blockers — blocking events (task.blocked, agent.blocked, ci.failed…) with no later unblocking signal, plus work items sitting in blocked status. Only use when the user explicitly asks to see/show/list blockers as cards; for a conversational question like "who is stuck" or "what is blocking X", answer in prose using this data instead of calling the tool.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => ({
      blockers: blockers.map((blocker) => ({
        summary: blocker.event.summary,
        type: blocker.event.type,
        source: blocker.event.source,
        member: blocker.member?.name ?? null,
        workItem: blocker.workItem ? `${blocker.workItem.key ?? ''} ${blocker.workItem.title}`.trim() : null,
        since: blocker.event.occurredAt.toISOString(),
      })),
    }),
  })
}
