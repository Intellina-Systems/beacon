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

// Which team/engine owns a work item is org routing — an admin/manager call.
// A lead delegates *within* the team they lead; they don't move work across it.
export function canRouteWorkItems(ctx: WorkspaceContext): boolean {
  return ctx.role === 'admin' || ctx.role === 'manager'
}

// Guards a change of assignee on a work item. Returns null when the change is
// allowed, or a human-readable reason when it isn't.
//
// - admin / manager: unrestricted.
// - lead of the item's team: may assign to anyone on the teams they lead.
// - everyone else: may claim an unassigned item, or drop one they hold. They
//   cannot hand work to a third party.
export async function checkWorkItemDelegation(
  ctx: WorkspaceContext,
  item: { teamId: string | null; assigneeMemberId: string | null },
  nextAssigneeId: string | null,
): Promise<string | null> {
  if (canRouteWorkItems(ctx)) return null

  const leadsThisItem = item.teamId !== null && leadTeamIds(ctx).includes(item.teamId)

  if (!leadsThisItem) {
    const claiming = nextAssigneeId === ctx.member.id && item.assigneeMemberId === null
    const dropping = nextAssigneeId === null && item.assigneeMemberId === ctx.member.id
    if (claiming || dropping) return null
    return "Only a lead of this item's team can reassign it"
  }

  if (nextAssigneeId) {
    const allowed = await detailVisibleMemberIds(ctx)
    if (allowed && !allowed.includes(nextAssigneeId)) {
      return 'You can only assign work to members of the teams you lead'
    }
  }
  return null
}

export function forbidden(message = 'Forbidden'): Response {
  return Response.json({ error: message }, { status: 403 })
}
