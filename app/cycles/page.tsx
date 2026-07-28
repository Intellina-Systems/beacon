import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, asc, desc, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { cycles, members, projectUpdates, projects, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canManageWorkspaceConfig } from '@/lib/auth/permissions'
import { getCurrentCycle } from '@/lib/cycles/lifecycle'
import { listSnapshots } from '@/lib/cycles/snapshots'
import { isUpdateStale } from '@/lib/projects/health'
import { PageShell, EmptyState } from '@/components/page-shell'
import { WorkItemsTable } from '@/components/work-items/work-items-table'
import { BurnupChart } from '@/components/cycles/burnup-chart'
import { CreateCycleDialog } from '@/components/cycles/create-cycle-dialog'
import { CloseCycleButton } from '@/components/cycles/close-cycle-button'
import { PostUpdateDialog } from '@/components/projects/post-update-dialog'
import { Badge } from '@/components/ui/badge'
import { RelativeTime } from '@/components/ui/relative-time'
import { cn } from '@/lib/utils'

const HEALTH_META: Record<string, { label: string; tone: string }> = {
  on_track: { label: 'On track', tone: 'bg-success text-white' },
  at_risk: { label: 'At risk', tone: 'bg-chart-5 text-white' },
  off_track: { label: 'Off track', tone: 'bg-destructive text-white' },
}

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cycles' }

function cyclesHref(projectId: string, cycleId?: string) {
  const params = new URLSearchParams({ project: projectId })
  if (cycleId) params.set('cycle', cycleId)
  return `/cycles?${params.toString()}`
}

function cycleStatus(cycle: { startsAt: Date; endsAt: Date; closedAt: Date | null }): 'upcoming' | 'active' | 'closed' {
  if (cycle.closedAt) return 'closed'
  const now = Date.now()
  if (now < cycle.startsAt.getTime()) return 'upcoming'
  if (now > cycle.endsAt.getTime()) return 'closed' // ended but not yet rolled over by the cron
  return 'active'
}

const STATUS_LABEL: Record<ReturnType<typeof cycleStatus>, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  closed: 'Closed',
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default async function CyclesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; cycle?: string }>
}) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const { project: rawProject, cycle: rawCycle } = await searchParams

  const projectList = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), ne(projects.status, 'archived')))
    .orderBy(projects.createdAt)

  if (projectList.length === 0) {
    return (
      <PageShell title="Cycles" description="Auto-repeating time-boxes for planned work" fixed>
        <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 lg:px-6">
          <div className="flex flex-1 rounded-lg border border-dashed">
            <EmptyState title="No projects yet" hint="Create a project on the Work page first." />
          </div>
        </div>
      </PageShell>
    )
  }

  const project = projectList.find((p) => p.id === rawProject) ?? projectList[0]

  const [cycleList, roster, latestUpdates] = await Promise.all([
    db
      .select()
      .from(cycles)
      .where(and(eq(cycles.workspaceId, workspaceId), eq(cycles.projectId, project.id)))
      .orderBy(desc(cycles.number)),
    db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.name),
    db
      .select({
        id: projectUpdates.id,
        health: projectUpdates.health,
        body: projectUpdates.body,
        authorName: members.name,
        createdAt: projectUpdates.createdAt,
      })
      .from(projectUpdates)
      .leftJoin(members, eq(members.id, projectUpdates.authorMemberId))
      .where(eq(projectUpdates.projectId, project.id))
      .orderBy(desc(projectUpdates.createdAt))
      .limit(1),
  ])
  const latestUpdate = latestUpdates[0] ?? null
  const stale = isUpdateStale(latestUpdate?.createdAt ?? null)

  const selectedCycle = rawCycle
    ? (cycleList.find((c) => c.id === rawCycle) ?? (await getCurrentCycle(project.id)))
    : await getCurrentCycle(project.id)

  const [items, snapshots] = selectedCycle
    ? await Promise.all([
        db
          .select({
            id: workItems.id,
            kind: workItems.kind,
            key: workItems.key,
            title: workItems.title,
            status: workItems.status,
            priority: workItems.priority,
            projectId: workItems.projectId,
            assigneeName: members.name,
            projectName: projects.name,
            externalUrl: workItems.externalUrl,
            lastEventAt: workItems.lastEventAt,
            updatedAt: workItems.updatedAt,
          })
          .from(workItems)
          .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
          .leftJoin(projects, eq(projects.id, workItems.projectId))
          .where(eq(workItems.cycleId, selectedCycle.id))
          .orderBy(asc(workItems.rank), asc(workItems.createdAt))
          .limit(200),
        listSnapshots(selectedCycle.id),
      ])
    : [[], []]

  const canManage = canManageWorkspaceConfig(ctx)
  const status = selectedCycle ? cycleStatus(selectedCycle) : null

  return (
    <PageShell
      title="Cycles"
      description="Auto-repeating time-boxes for planned work"
      actions={canManage && cycleList.length === 0 ? <CreateCycleDialog projectId={project.id} /> : undefined}
      fixed
    >
      <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 lg:px-6">
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {projectList.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {projectList.map((p) => (
                <Link
                  key={p.id}
                  href={cyclesHref(p.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
                    project.id === p.id
                      ? 'border-beacon/50 bg-beacon/10 text-foreground'
                      : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
                  )}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          )}

          <div className="mb-4 rounded-lg border bg-card px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="micro-label">Project health</p>
                  {latestUpdate && (
                    <Badge className={cn('text-[10px]', HEALTH_META[latestUpdate.health].tone)}>
                      {HEALTH_META[latestUpdate.health].label}
                    </Badge>
                  )}
                  {stale && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Update needed
                    </Badge>
                  )}
                </div>
                {latestUpdate ? (
                  <>
                    <p className="mt-1.5 text-sm leading-snug">{latestUpdate.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {latestUpdate.authorName ?? 'Someone'} · <RelativeTime date={latestUpdate.createdAt} />
                    </p>
                  </>
                ) : (
                  <p className="mt-1.5 text-sm text-muted-foreground">No update posted yet.</p>
                )}
              </div>
              <PostUpdateDialog projectId={project.id} />
            </div>
          </div>

          {cycleList.length === 0 ? (
            <div className="flex rounded-lg border border-dashed">
              <EmptyState
                title="No cycles yet"
                hint={
                  canManage
                    ? 'Start the first cycle above — after that, new cycles are created automatically.'
                    : 'An admin or manager can start this project’s first cycle.'
                }
              />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
              <div className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
                {cycleList.map((c) => (
                  <Link
                    key={c.id}
                    href={cyclesHref(project.id, c.id)}
                    className={cn(
                      'shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition-colors lg:shrink',
                      selectedCycle?.id === c.id
                        ? 'border-beacon/50 bg-beacon/10 text-foreground'
                        : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
                    )}
                  >
                    <p className="font-medium">{c.name ?? `Cycle ${c.number}`}</p>
                    <p className="text-[10px] opacity-70">{STATUS_LABEL[cycleStatus(c)]}</p>
                  </Link>
                ))}
              </div>

              <div className="min-w-0 space-y-4">
                {selectedCycle && status && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="font-semibold">{selectedCycle.name ?? `Cycle ${selectedCycle.number}`}</h2>
                          <Badge
                            variant={status === 'active' ? 'default' : status === 'upcoming' ? 'secondary' : 'outline'}
                            className="text-[10px]"
                          >
                            {STATUS_LABEL[status]}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(selectedCycle.startsAt)} – {formatDate(selectedCycle.endsAt)} · {items.length}{' '}
                          item
                          {items.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      {canManage && status !== 'closed' && <CloseCycleButton cycleId={selectedCycle.id} />}
                    </div>

                    <div className="rounded-lg border bg-card p-4">
                      <BurnupChart
                        snapshots={snapshots}
                        startsAt={selectedCycle.startsAt}
                        endsAt={selectedCycle.endsAt}
                      />
                    </div>

                    {items.length === 0 ? (
                      <div className="flex rounded-lg border border-dashed">
                        <EmptyState
                          title="No items in this cycle"
                          hint="Items join automatically once they're started, or add one from its detail panel on the Work page."
                        />
                      </div>
                    ) : (
                      <WorkItemsTable
                        rows={items}
                        roster={roster}
                        projects={projectList}
                        currentMemberId={ctx.member.id}
                        isTriageView={false}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
