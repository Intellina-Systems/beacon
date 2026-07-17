import 'server-only'

import { cache } from 'react'
import { asc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { members, projects, teamMembers, teams, workspaces, type AccessRole, type Member } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'

export interface ContextTeam {
  id: string
  name: string
  isLead: boolean
}

export interface WorkspaceContext {
  workspaceId: string
  workspaceName: string
  member: Member
  role: AccessRole
  teams: ContextTeam[]
}

async function loadTeams(memberId: string): Promise<ContextTeam[]> {
  const rows = await db
    .select({ id: teams.id, name: teams.name, isLead: teamMembers.isLead })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.memberId, memberId))
    .orderBy(asc(teams.name))
  return rows
}

// First login of a brand-new user: give them their own workspace, a default
// project, and an admin member row (the solo flow that existed before roles).
async function bootstrapWorkspace(user: {
  id: string
  name?: string
  username: string
  email?: string
  avatar?: string
}) {
  const workspaceId = nanoid()
  const displayName = user.name || user.username
  await db.insert(workspaces).values({
    id: workspaceId,
    name: `${displayName}'s Workspace`,
    createdByUserId: user.id,
  })
  await db.insert(projects).values({
    id: nanoid(),
    workspaceId,
    name: 'General',
    description: 'Default project',
  })
  const [member] = await db
    .insert(members)
    .values({
      id: nanoid(),
      workspaceId,
      authUserId: user.id,
      accessRole: 'admin',
      status: 'active',
      name: displayName,
      email: user.email ?? null,
      avatarUrl: user.avatar ?? null,
    })
    .returning()
  return { workspaceId, workspaceName: `${displayName}'s Workspace`, member }
}

// The request-scoped tenant + role resolution. Every page and API route that
// touches workspace data goes through this instead of session.user.id.
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const session = await getServerSession()
  if (!session?.user) return null

  const rows = await db
    .select({ member: members, workspaceName: workspaces.name })
    .from(members)
    .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
    .where(eq(members.authUserId, session.user.id))
    .orderBy(asc(members.createdAt))
    .limit(1)

  let member: Member
  let workspaceName: string
  if (rows.length > 0) {
    member = rows[0].member
    workspaceName = rows[0].workspaceName
  } else {
    const bootstrapped = await bootstrapWorkspace(session.user)
    member = bootstrapped.member
    workspaceName = bootstrapped.workspaceName
  }

  return {
    workspaceId: member.workspaceId,
    workspaceName,
    member,
    role: member.accessRole,
    teams: await loadTeams(member.id),
  }
})
