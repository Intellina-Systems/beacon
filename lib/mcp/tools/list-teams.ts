import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { members, teamMembers, teams } from '@/lib/db/schema'
import { getMcpAuth } from '../context'

const inputSchema = z.object({})

interface TeamOut {
  id: string
  name: string
  description: string | null
  kind: string
  members: { id: string; name: string; isLead: boolean }[]
}

export function registerListTeamsTool(server: McpServer) {
  server.registerTool(
    'list_teams',
    {
      title: 'List teams',
      description: "List the workspace's teams and their rosters.",
      inputSchema,
    },
    async (_input, ctx: ServerContext) => {
      const auth = getMcpAuth(ctx)
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
        .where(eq(teams.workspaceId, auth.workspaceId))
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

      return { content: [{ type: 'text' as const, text: JSON.stringify([...byTeam.values()]) }] }
    },
  )
}
