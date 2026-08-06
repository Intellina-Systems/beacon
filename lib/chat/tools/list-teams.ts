import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, teamMembers, teams } from '@/lib/db/schema'
import type { ChatToolContext } from './shared'

interface TeamOut {
  id: string
  name: string
  description: string | null
  kind: string
  members: { id: string; name: string; isLead: boolean }[]
}

export function createListTeamsTool({ workspaceId }: ChatToolContext) {
  return tool({
    description: "List the workspace's teams and their rosters.",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const rows = await db
        .select({
          id: teams.id,
          name: teams.name,
          description: teams.description,
          kind: teams.kind,
          memberId: teamMembers.memberId,
          memberName: members.name,
          isLead: teamMembers.isLead,
        })
        .from(teams)
        .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
        .leftJoin(members, eq(members.id, teamMembers.memberId))
        .where(eq(teams.workspaceId, workspaceId))
        .orderBy(asc(teams.name))

      const byTeam = new Map<string, TeamOut>()
      for (const row of rows) {
        let team = byTeam.get(row.id)
        if (!team) {
          team = { id: row.id, name: row.name, description: row.description, kind: row.kind, members: [] }
          byTeam.set(row.id, team)
        }
        if (row.memberId && row.memberName) {
          team.members.push({ id: row.memberId, name: row.memberName, isLead: row.isLead ?? false })
        }
      }
      return { teams: [...byTeam.values()] }
    },
  })
}
