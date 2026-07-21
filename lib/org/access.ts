import 'server-only'

import { isAdmin } from '@/lib/auth/permissions'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'

// A group's Lead (ownerMemberId) can manage that one group without being a
// workspace Admin — "middle man" access, scoped to the group they lead.
// Deleting the group or reassigning its Lead stays Admin-only (callers check
// that separately) so a Lead can't lock out their own group.
export function canManageOrgUnit(ctx: WorkspaceContext, unit: { ownerMemberId: string | null }): boolean {
  return isAdmin(ctx) || (unit.ownerMemberId !== null && unit.ownerMemberId === ctx.member.id)
}
