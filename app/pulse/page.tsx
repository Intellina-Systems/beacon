import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { Activity, ArrowUpRight, Bot, GitMerge, Lightbulb, Users } from 'lucide-react'
import { db } from '@/lib/db/client'
import { insights, members, projects, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canViewAllTeams } from '@/lib/auth/permissions'
import { getActiveBlockers, getDailyActivity, getMemberActivity, getPulse, listEvents } from '@/lib/events/queries'
import {
  getAssignedWorkItems,
  getMemberPlan,
  getTodaysPlans,
  hydrateWorkItems,
  serverDateKey,
} from '@/lib/plans/queries'
import { getBusyIntervals } from '@/lib/calendar/free-busy'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageShell, Panel, PanelHeader } from '@/components/page-shell'
import { DailyPlanCard, type PlanWorkItemOption } from '@/components/plans/daily-plan-card'
import { TodaysPlansPanel } from '@/components/plans/todays-plans-panel'
import { BlockersPanel, type BlockerRow } from '@/components/pulse/blockers-panel'
import { EventItem } from '@/components/events/event-item'
import { InsightActions } from '@/components/insights/insight-actions'
import { relativeTime } from '@/lib/utils/relative-time'
import { cn } from '@/lib/utils'

const SEVERITY_DOT: Record<string, string> = {
  info: 'bg-chart-2',
  warning: 'bg-chart-5',
  critical: 'bg-destructive',
}

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
}

const STATUS_DOT: Record<string, string> = {
  todo: 'bg-muted-foreground/50',
  in_progress: 'bg-chart-2',
  in_review: 'bg-chart-3',
  blocked: 'bg-destructive',
}

function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  )
}

/** Zero-fill the last N days so the chart always shows a complete axis. */
function fillDays(rows: { day: string; count: number }[], days: number) {
  const byDay = new Map(rows.map((r) => [r.day, r.count]))
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    return { key, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: byDay.get(key) ?? 0 }
  })
}

export default async function PulsePage() {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  if (!canViewAllTeams(ctx)) redirect('/timeline')
  const workspaceId = ctx.workspaceId

  const today = serverDateKey()

  const [
    pulse,
    blockers,
    recentEvents,
    dailyActivity,
    memberActivity,
    roster,
    activeInsights,
    activeItems,
    myPlan,
    assignedItems,
    todaysPlans,
  ] = await Promise.all([
    getPulse(workspaceId, 7),
    getActiveBlockers(workspaceId),
    listEvents(workspaceId, { limit: 30 }),
    getDailyActivity(workspaceId, 14),
    getMemberActivity(workspaceId, 7),
    db.select().from(members).where(eq(members.workspaceId, workspaceId)).orderBy(members.name).limit(12),
    db
      .select({
        id: insights.id,
        kind: insights.kind,
        severity: insights.severity,
        title: insights.title,
        detail: insights.detail,
        createdAt: insights.createdAt,
      })
      .from(insights)
      .where(and(eq(insights.workspaceId, workspaceId), eq(insights.status, 'active')))
      .orderBy(desc(insights.createdAt))
      .limit(20),
    db
      .select({
        status: workItems.status,
        id: workItems.id,
        projectId: workItems.projectId,
        projectName: projects.name,
      })
      .from(workItems)
      .leftJoin(projects, eq(projects.id, workItems.projectId))
      .where(
        and(
          eq(workItems.workspaceId, workspaceId),
          inArray(workItems.status, ['todo', 'in_progress', 'in_review', 'blocked']),
        ),
      ),
    getMemberPlan(ctx.member.id, today),
    getAssignedWorkItems(workspaceId, ctx.member.id),
    getTodaysPlans(ctx, today),
  ])

  // The composer's pick list: assigned active items plus anything already
  // linked (which may no longer be assigned/active), deduped.
  const linkedExtra = myPlan ? await hydrateWorkItems(workspaceId, myPlan.workItemIds) : []
  const planOptionMap = new Map<string, PlanWorkItemOption>()
  for (const item of [...assignedItems, ...linkedExtra]) {
    planOptionMap.set(item.id, { id: item.id, key: item.key, title: item.title })
  }
  const planOptions = [...planOptionMap.values()]

  const blockerRows: BlockerRow[] = blockers.map((b) => {
    const payload = b.event.payload
    const reason =
      payload && typeof payload === 'object' && 'reason' in payload
        ? String((payload as Record<string, unknown>).reason)
        : null
    return {
      eventId: b.event.id,
      summary: b.event.summary,
      reason,
      workItemId: b.event.workItemId,
      workItemKey: b.event.workItemKey ?? null,
      memberId: b.member?.id ?? b.event.memberId ?? null,
      memberName: b.member?.name ?? b.event.memberName ?? null,
      actorLabel: b.event.actorLabel ?? null,
      occurredAt: b.event.occurredAt.toISOString(),
    }
  })

  // Today's meeting count for the current member, from the native calendar.
  const dayStart = new Date(`${today}T00:00:00.000Z`)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
  const myBusy = await getBusyIntervals(workspaceId, [ctx.member.id], dayStart, dayEnd)
  const myMeetingCount = myBusy.get(ctx.member.id)?.length ?? 0

  const statusCounts = activeItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1
    return acc
  }, {})

  const projectCounts = new Map<string, { name: string; count: number }>()
  for (const item of activeItems) {
    if (!item.projectId) continue
    const entry = projectCounts.get(item.projectId) ?? { name: item.projectName ?? 'Untitled', count: 0 }
    entry.count += 1
    projectCounts.set(item.projectId, entry)
  }

  const series = fillDays(dailyActivity, 14)
  const maxDaily = Math.max(1, ...series.map((d) => d.count))

  const stats = [
    { icon: Activity, label: 'Events · 7d', value: pulse.totalEvents, href: '/timeline' },
    { icon: GitMerge, label: 'PRs merged', value: pulse.prsMerged, href: '/timeline' },
    { icon: Users, label: 'Active engineers', value: pulse.activeMemberIds.length, href: '/team' },
    { icon: Bot, label: 'Agent events', value: pulse.byCategory.agent, href: '/timeline' },
  ]

  return (
    <PageShell title="Pulse" description={`What's happening across ${ctx.workspaceName}, right now`} fixed>
      <div className="flex flex-col gap-4 p-4 lg:h-full lg:p-5">
        {/* Your plan for today — the one manual signal Beacon asks for */}
        <div className="shrink-0">
          <DailyPlanCard
            initialIntention={myPlan?.intention ?? null}
            initialWorkItemIds={myPlan?.workItemIds ?? []}
            options={planOptions}
            meetingCount={myMeetingCount}
          />
        </div>

        {/* KPI row */}
        <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(({ icon: Icon, label, value, href }, i) => (
            <Link
              key={label}
              href={href}
              className="animate-rise group rounded-lg border bg-card px-4 py-3.5 shadow-xs transition-colors duration-200 hover:border-beacon/30 hover:bg-accent/30"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <p className="micro-label">{label}</p>
                <Icon className="h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-hover:text-beacon" />
              </div>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight lg:text-[28px]">{value}</p>
            </Link>
          ))}
        </div>

        {/* Panels — internal scroll on desktop so the page never scrolls */}
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12">
          <div className="flex min-h-0 flex-col gap-4 lg:col-span-8">
            <Panel className="shrink-0">
              <PanelHeader label="Activity · 14 days" meta={<span className="tabular-nums">peak {maxDaily}</span>} />
              <div className="px-4 pb-3 pt-4">
                <div className="flex h-24 items-end gap-1">
                  {series.map((day) => (
                    <div
                      key={day.key}
                      className="group relative flex-1"
                      title={`${day.label}: ${day.count} event${day.count === 1 ? '' : 's'}`}
                    >
                      <div
                        className={cn(
                          'w-full rounded-[3px] transition-colors',
                          day.count > 0 ? 'bg-beacon/80 group-hover:bg-beacon' : 'bg-muted',
                        )}
                        style={{ height: `${Math.max(3, Math.round((day.count / maxDaily) * 96))}px` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>{series[0].label}</span>
                  <span>{series[series.length - 1].label}</span>
                </div>
              </div>
            </Panel>

            <Panel className="flex-1">
              <PanelHeader label="Latest events" meta={<PanelLink href="/timeline" label="Timeline" />} />
              <div className="min-h-0 flex-1 divide-y overflow-y-auto px-4">
                {recentEvents.length === 0 ? (
                  <EmptyState
                    title="No events yet"
                    hint="Connect a source or point an agent at the events API to light this up."
                  />
                ) : (
                  recentEvents.map((event) => <EventItem key={event.id} event={event} />)
                )}
              </div>
            </Panel>
          </div>

          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto lg:col-span-4">
            <BlockersPanel blockers={blockerRows} className="max-h-[300px] shrink-0" />

            <TodaysPlansPanel plans={todaysPlans} className="max-h-[300px] shrink-0" />

            <Panel className="shrink-0">
              <PanelHeader label="Work in flight" meta={<PanelLink href="/work" label="All work" />} />
              <div className="space-y-2 px-4 py-3">
                {activeItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active work items.</p>
                ) : (
                  Object.entries(statusCounts).map(([status, statusCount]) => (
                    <Link
                      key={status}
                      href={`/work?status=${status}`}
                      className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/60"
                    >
                      <span
                        className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status] ?? 'bg-muted-foreground/50')}
                      />
                      <span className="flex-1">{STATUS_LABEL[status] ?? status}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">{statusCount}</span>
                    </Link>
                  ))
                )}
                {projectCounts.size > 1 && (
                  <>
                    <p className="micro-label border-t pt-2">By project</p>
                    {[...projectCounts.entries()]
                      .sort((a, b) => b[1].count - a[1].count)
                      .map(([projectId, { name, count: projectCount }]) => (
                        <Link
                          key={projectId}
                          href={`/work?project=${projectId}`}
                          className="flex items-center gap-2 text-sm transition-colors hover:text-foreground"
                        >
                          <span className="flex-1 truncate text-muted-foreground">{name}</span>
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">{projectCount}</span>
                        </Link>
                      ))}
                  </>
                )}
              </div>
            </Panel>

            <Panel className="max-h-56 shrink-0">
              <PanelHeader label="Team" meta={<PanelLink href="/team" label="Roster" />} />
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
                {roster.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">No members yet.</p>
                ) : (
                  roster.map((member) => {
                    const activity = memberActivity.get(member.id)
                    return (
                      <Link
                        key={member.id}
                        href={`/team/${member.id}`}
                        className="-mx-2 flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                      >
                        <span className="truncate">{member.name}</span>
                        <span
                          className={cn(
                            'ml-2 shrink-0 font-mono text-xs tabular-nums',
                            activity ? 'text-foreground/70' : 'text-muted-foreground/60',
                          )}
                        >
                          {activity ? `${activity.total} ev` : 'quiet'}
                        </span>
                      </Link>
                    )
                  })
                )}
              </div>
            </Panel>

            <Panel className="max-h-80 min-h-40 shrink-0">
              <PanelHeader
                label={
                  <span className="flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Insights
                  </span>
                }
                meta={
                  <Badge variant={activeInsights.length > 0 ? 'default' : 'outline'} className="tabular-nums">
                    {activeInsights.length}
                  </Badge>
                }
              />
              <div className="min-h-0 flex-1 divide-y overflow-y-auto px-4">
                {activeInsights.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">Nothing flagged right now.</p>
                ) : (
                  activeInsights.map((insight) => (
                    <div key={insight.id} className="flex items-start gap-2 py-2.5">
                      <span
                        className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', SEVERITY_DOT[insight.severity])}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">{insight.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{insight.detail}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                          {relativeTime(insight.createdAt)}
                        </p>
                      </div>
                      <InsightActions insightId={insight.id} />
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
