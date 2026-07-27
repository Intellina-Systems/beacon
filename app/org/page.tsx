import { redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, teamMembers, teams } from '@/lib/db/schema'
import { getWorkspaceContext, type WorkspaceContext } from '@/lib/auth/workspace-context'
import { canViewAllTeams, isAdmin } from '@/lib/auth/permissions'
import { canManageOrgUnit } from '@/lib/org/access'
import { listEngines, type OrgUnitRow } from '@/lib/org/list'
import { PageShell } from '@/components/page-shell'
import { OrgUnitSection } from '@/components/org/org-unit-section'
import { TeamsSection, type TeamWithMembers } from '@/components/teams/teams-section'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Org' }

function manageableIdsFor(ctx: WorkspaceContext, units: OrgUnitRow[]): Set<string> {
  return new Set(units.filter((u) => canManageOrgUnit(ctx, u)).map((u) => u.id))
}

export default async function OrgPage() {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const [engineUnits, roster, teamRows] = await Promise.all([
    listEngines(workspaceId),
    db
      .select({ id: members.id, name: members.name, avatarUrl: members.avatarUrl })
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(asc(members.name)),
    db
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
      .where(eq(teams.workspaceId, workspaceId))
      .orderBy(teams.name),
  ])

  // Same "one Teams list" the /team page renders, so both pages stay in sync.
  const teamsById = new Map<string, TeamWithMembers>()
  for (const row of teamRows) {
    const team = teamsById.get(row.id) ?? {
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
    teamsById.set(row.id, team)
  }
  const allTeams = [...teamsById.values()]
  const visibleTeams = canViewAllTeams(ctx)
    ? allTeams
    : allTeams.filter((t) => t.members.some((m) => m.id === ctx.member.id))

  const admin = isAdmin(ctx)

  return (
    <PageShell title="Org" description="All engines and teams — the complete org chart, independent of projects" fixed>
      <div className="grid w-full gap-5 px-4 py-5 lg:h-full lg:grid-cols-2 lg:px-6">
        <OrgUnitSection
          label="Engine"
          apiBase="/api/engines"
          hrefBase="/org/engine"
          units={engineUnits}
          roster={roster}
          canCreate={admin}
          manageableIds={manageableIdsFor(ctx, engineUnits)}
          isWorkspaceAdmin={admin}
        />
        <TeamsSection teams={visibleTeams} roster={roster} canManage={admin} scopedToSelf={!canViewAllTeams(ctx)} />
      </div>
    </PageShell>
  )
}
