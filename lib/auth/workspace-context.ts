import 'server-only'

import { cache } from 'react'
import { asc, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { members, projects, teamMembers, teams, workspaces, type AccessRole, type Member } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getActiveWorkspaceCookie } from '@/lib/workspace/active-workspace-cookie'

export interface ContextTeam {
  id: string
  name: string
  isLead: boolean
}

export interface ContextMembership {
  workspaceId: string
  workspaceName: string
}

export interface WorkspaceContext {
  workspaceId: string
  workspaceName: string
  member: Member
  role: AccessRole
  teams: ContextTeam[]
  // Every workspace this login account belongs to, for the workspace switcher.
  // Includes the active one.
  memberships: ContextMembership[]
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
//
// One login account can hold membership in several workspaces (invites create
// a new member row for the same authUserId in a different workspace). Which
// one is "active" is a per-browser preference: a cookie set by
// POST /api/workspace/switch. Absent a valid cookie, the most recently joined
// membership wins — newest first, so accepting a fresh invite feels immediate
// even before the switcher cookie is written.
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const session = await getServerSession()
  if (!session?.user) return null

  const rows = await db
    .select({ member: members, workspaceName: workspaces.name })
    .from(members)
    .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
    .where(eq(members.authUserId, session.user.id))
    .orderBy(desc(members.createdAt))

  let member: Member
  let workspaceName: string
  let memberships: ContextMembership[]

  if (rows.length > 0) {
    const activeWorkspaceId = await getActiveWorkspaceCookie()
    const active = (activeWorkspaceId && rows.find((row) => row.member.workspaceId === activeWorkspaceId)) || rows[0]
    member = active.member
    workspaceName = active.workspaceName
    memberships = rows
      .map((row) => ({ workspaceId: row.member.workspaceId, workspaceName: row.workspaceName }))
      .sort((a, b) => a.workspaceName.localeCompare(b.workspaceName))
  } else {
    // No membership. Bootstrapping a workspace here used to be unconditional,
    // which meant anyone who authenticated became the owner of a brand-new
    // tenant — the reason sign-in is now gated in the OAuth callbacks. Keep it
    // only for a genuinely empty install, so the first arrival can found the
    // workspace and everyone after them must be invited into one.
    const [anyWorkspace] = await db.select({ id: workspaces.id }).from(workspaces).limit(1)
    if (anyWorkspace) return null

    const bootstrapped = await bootstrapWorkspace(session.user)
    member = bootstrapped.member
    workspaceName = bootstrapped.workspaceName
    memberships = [{ workspaceId: member.workspaceId, workspaceName }]
  }

  return {
    workspaceId: member.workspaceId,
    workspaceName,
    member,
    role: member.accessRole,
    teams: await loadTeams(member.id),
    memberships,
  }
})

// Same shape as getWorkspaceContext, but resolved from a member id directly
// instead of the session cookie — for callers authenticated by something
// other than a browser session (an MCP grant tied to a specific member, for
// instance). Returns null for a member who no longer exists or has been
// deactivated, so a bearer credential minted for that member stops resolving
// to a context — and therefore stops passing any permission check — the
// moment an admin removes them, not only once the credential's TTL expires.
export async function getWorkspaceContextForMember(memberId: string): Promise<WorkspaceContext | null> {
  const [row] = await db
    .select({ member: members, workspaceName: workspaces.name })
    .from(members)
    .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
    .where(eq(members.id, memberId))
    .limit(1)
  if (!row || row.member.status !== 'active') return null

  const { member, workspaceName } = row
  return {
    workspaceId: member.workspaceId,
    workspaceName,
    member,
    role: member.accessRole,
    teams: await loadTeams(member.id),
    memberships: [{ workspaceId: member.workspaceId, workspaceName }],
  }
}
