import { redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, teams } from '@/lib/db/schema'
import { getWorkspaceContext, type WorkspaceContext } from '@/lib/auth/workspace-context'
import { isAdmin } from '@/lib/auth/permissions'
import { canManageOrgUnit } from '@/lib/org/access'
import { listEngines, listFunctions, type OrgUnitRow } from '@/lib/org/list'
import { PageShell } from '@/components/page-shell'
import { OrgUnitSection } from '@/components/org/org-unit-section'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Org' }

function manageableIdsFor(ctx: WorkspaceContext, units: OrgUnitRow[]): Set<string> {
  return new Set(units.filter((u) => canManageOrgUnit(ctx, u)).map((u) => u.id))
}

export default async function OrgPage() {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')

  const [engineUnits, functionUnits, roster, teamRows] = await Promise.all([
    listEngines(ctx.workspaceId),
    listFunctions(ctx.workspaceId),
    db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(eq(members.workspaceId, ctx.workspaceId))
      .orderBy(asc(members.name)),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.workspaceId, ctx.workspaceId))
      .orderBy(asc(teams.name)),
  ])

  const admin = isAdmin(ctx)

  return (
    <PageShell title="Org" description="All engines and teams — the complete org chart, independent of projects">
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 lg:px-6">
        <OrgUnitSection
          label="Engine"
          apiBase="/api/engines"
          units={engineUnits}
          roster={roster}
          teamOptions={teamRows}
          canCreate={admin}
          manageableIds={manageableIdsFor(ctx, engineUnits)}
          isWorkspaceAdmin={admin}
        />
        <OrgUnitSection
          label="Team"
          apiBase="/api/functions"
          units={functionUnits}
          roster={roster}
          teamOptions={teamRows}
          canCreate={admin}
          manageableIds={manageableIdsFor(ctx, functionUnits)}
          isWorkspaceAdmin={admin}
        />
      </div>
    </PageShell>
  )
}
