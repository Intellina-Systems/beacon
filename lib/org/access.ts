import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { teamMembers } from '@/lib/db/schema'
import { isAdmin } from '@/lib/auth/permissions'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'

// A group's Lead (ownerMemberId) can manage that one group without being a
// workspace Admin — "middle man" access, scoped to the group they lead.
// Deleting the group or reassigning its Lead stays Admin-only (callers check
// that separately) so a Lead can't lock out their own group.
export function canManageOrgUnit(ctx: WorkspaceContext, unit: { ownerMemberId: string | null }): boolean {
  return isAdmin(ctx) || (unit.ownerMemberId !== null && unit.ownerMemberId === ctx.member.id)
}

// Teams keep their leads in team_members.isLead rather than a column on the
// team row (a team can have several), so membership has to be queried rather
// than compared like canManageOrgUnit does.
//
// Same boundary as engines: a Lead may rename their team and change who is on
// it, but promoting or demoting a Lead — and deleting the team — stays
// Admin-only, so a Lead can neither lock the team's Admins out nor hand
// themselves permanent control.
export async function canManageTeam(ctx: WorkspaceContext, teamId: string): Promise<boolean> {
  if (isAdmin(ctx)) return true
  const [row] = await db
    .select({ isLead: teamMembers.isLead })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.memberId, ctx.member.id)))
    .limit(1)
  return row?.isLead === true
}
