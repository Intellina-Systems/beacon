import 'server-only'

import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { teamMembers, users } from '@/lib/db/schema'
import type { WorkspaceContext } from './workspace-context'

export function isAdmin(ctx: WorkspaceContext): boolean {
  return ctx.role === 'admin'
}

// Platform-wide admin, independent of workspace membership/role. There is no
// in-app way to grant this — it's set with a direct DB update on `users`.
export async function isSuperAdminUser(userId: string): Promise<boolean> {
  const [row] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  return row?.isSuperAdmin ?? false
}

// Only admins see every team; everyone else (managers included) is scoped to
// their own team(s) — a manager's "own team" is just their teamMembers rows,
// the same membership managers already have via ctx.teams.
export function canViewAllTeams(ctx: WorkspaceContext): boolean {
  return ctx.role === 'admin'
}

// Workspace-wide config surfaces (cycles, automation rules, projects) have no
// team dimension to scope by, so admin and manager stay the same unrestricted
// tier here regardless of canViewAllTeams' team-visibility scoping.
export function canManageWorkspaceConfig(ctx: WorkspaceContext): boolean {
  return ctx.role === 'admin' || ctx.role === 'manager'
}

export function leadTeamIds(ctx: WorkspaceContext): string[] {
  return ctx.teams.filter((t) => t.isLead).map((t) => t.id)
}

// The member ids whose activity this viewer may see. `null` means unrestricted
// (admin only). For everyone else: teammates across all their teams + self.
export async function visibleMemberIds(ctx: WorkspaceContext): Promise<string[] | null> {
  if (canViewAllTeams(ctx)) return null
  const teamIds = ctx.teams.map((t) => t.id)
  if (teamIds.length === 0) return [ctx.member.id]
  const rows = await db
    .select({ memberId: teamMembers.memberId })
    .from(teamMembers)
    .where(inArray(teamMembers.teamId, teamIds))
  const ids = new Set(rows.map((r) => r.memberId))
  ids.add(ctx.member.id)
  return [...ids]
}

// Members whose individual metrics/drill-downs this viewer may open: everyone
// for admin (`null`), self + led teams' members for a team lead, and only
// self for anyone else (including a non-lead manager). Roster names are
// visible to all regardless.
export async function detailVisibleMemberIds(ctx: WorkspaceContext): Promise<string[] | null> {
  if (canViewAllTeams(ctx)) return null
  const ledTeams = leadTeamIds(ctx)
  if (ledTeams.length === 0) return [ctx.member.id]
  const rows = await db
    .select({ memberId: teamMembers.memberId })
    .from(teamMembers)
    .where(inArray(teamMembers.teamId, ledTeams))
  const ids = new Set(rows.map((r) => r.memberId))
  ids.add(ctx.member.id)
  return [...ids]
}

export function forbidden(message = 'Forbidden'): Response {
  return Response.json({ error: message }, { status: 403 })
}
