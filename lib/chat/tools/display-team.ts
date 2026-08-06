import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import type { ChatToolContext } from './shared'

export function createDisplayTeamTool({ roster, visible, memberActivity }: ChatToolContext) {
  return tool({
    description:
      'Display the team roster as cards with role and weekly activity. Only use when the user explicitly asks to see/show/list the team or roster as cards — not for conversational questions about who is active or capacity, which should be answered in prose instead.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => ({
      members: roster.map((member) => ({
        id: member.id,
        name: member.name,
        title: member.title,
        avatarUrl: member.avatarUrl,
        weeklyEvents: visible && !visible.includes(member.id) ? null : (memberActivity.get(member.id)?.total ?? 0),
        skills: member.skills,
      })),
    }),
  })
}
