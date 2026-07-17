import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { members, teamMembers, teams, TEAM_KINDS } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      description: teams.description,
      kind: teams.kind,
      memberId: teamMembers.memberId,
      memberName: members.name,
      memberAvatarUrl: members.avatarUrl,
      isLead: teamMembers.isLead,
    })
    .from(teams)
    .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .leftJoin(members, eq(members.id, teamMembers.memberId))
    .where(eq(teams.workspaceId, ctx.workspaceId))
    .orderBy(asc(teams.name))

  const byTeam = new Map<
    string,
    {
      id: string
      name: string
      description: string | null
      kind: string
      members: { id: string; name: string; avatarUrl: string | null; isLead: boolean }[]
    }
  >()
  for (const row of rows) {
    const team = byTeam.get(row.id) ?? {
      id: row.id,
      name: row.name,
      description: row.description,
      kind: row.kind,
      members: [],
    }
    if (row.memberId && row.memberName !== null) {
      team.members.push({
        id: row.memberId,
        name: row.memberName,
        avatarUrl: row.memberAvatarUrl,
        isLead: !!row.isLead,
      })
    }
    byTeam.set(row.id, team)
  }

  return Response.json({ teams: [...byTeam.values()] })
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  kind: z.enum(TEAM_KINDS).default('engineering'),
})

export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid team', issues: parsed.error.issues }, { status: 400 })

  const [team] = await db
    .insert(teams)
    .values({ id: nanoid(), workspaceId: ctx.workspaceId, ...parsed.data })
    .onConflictDoNothing()
    .returning()

  if (!team) return Response.json({ error: 'A team with that name already exists' }, { status: 409 })
  return Response.json({ team }, { status: 201 })
}
