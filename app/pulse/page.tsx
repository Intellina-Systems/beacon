import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq, inArray } from 'drizzle-orm'
import { AlertTriangle, Activity, ArrowUpRight, Bot, GitMerge, Users } from 'lucide-react'
import { db } from '@/lib/db/client'
import { members, workItems } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getActiveBlockers, getDailyActivity, getMemberActivity, getPulse, listEvents } from '@/lib/events/queries'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageShell, Panel, PanelHeader } from '@/components/page-shell'
import { EventItem } from '@/components/events/event-item'
import { relativeTime } from '@/lib/utils/relative-time'
import { cn } from '@/lib/utils'

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
  const session = await getServerSession()
  if (!session?.user) redirect('/')
  const userId = session.user.id

  const [pulse, blockers, recentEvents, dailyActivity, memberActivity, roster, activeItems] = await Promise.all([
    getPulse(userId, 7),
    getActiveBlockers(userId),
    listEvents(userId, { limit: 30 }),
    getDailyActivity(userId, 14),
    getMemberActivity(userId, 7),
    db.select().from(members).where(eq(members.userId, userId)).orderBy(members.name).limit(12),
    db
      .select({ status: workItems.status, id: workItems.id })
      .from(workItems)
      .where(
        and(eq(workItems.userId, userId), inArray(workItems.status, ['todo', 'in_progress', 'in_review', 'blocked'])),
      ),
  ])

  const statusCounts = activeItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1
    return acc
  }, {})

  const series = fillDays(dailyActivity, 14)
  const maxDaily = Math.max(1, ...series.map((d) => d.count))

  const stats = [
    { icon: Activity, label: 'Events · 7d', value: pulse.totalEvents },
    { icon: GitMerge, label: 'PRs merged', value: pulse.prsMerged },
    { icon: Users, label: 'Active engineers', value: pulse.activeMemberIds.length },
    { icon: Bot, label: 'Agent events', value: pulse.byCategory.agent },
  ]

  return (
    <PageShell title="Pulse" description="What's happening across engineering, right now" fixed>
      <div className="flex flex-col gap-4 p-4 lg:h-full lg:p-5">
        {/* KPI row */}
        <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-lg border bg-card px-4 py-3.5">
              <div className="flex items-center justify-between">
                <p className="micro-label">{label}</p>
                <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
              </div>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight lg:text-[28px]">{value}</p>
            </div>
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

          <div className="flex min-h-0 flex-col gap-4 lg:col-span-4">
            <Panel className={cn('max-h-[40%] shrink-0', blockers.length > 0 && 'border-destructive/40')}>
              <PanelHeader
                label={
                  <span className={cn('flex items-center gap-1.5', blockers.length > 0 && 'text-destructive')}>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Blockers
                  </span>
                }
                meta={
                  <Badge variant={blockers.length > 0 ? 'destructive' : 'outline'} className="tabular-nums">
                    {blockers.length}
                  </Badge>
                }
              />
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                {blockers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody is blocked.</p>
                ) : (
                  blockers.map((blocker) => (
                    <div key={blocker.event.id} className="text-sm">
                      <p className="leading-snug">{blocker.event.summary}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[blocker.member?.name, relativeTime(blocker.event.occurredAt)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel className="shrink-0">
              <PanelHeader label="Work in flight" meta={<PanelLink href="/work" label="All work" />} />
              <div className="space-y-2 px-4 py-3">
                {activeItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active work items.</p>
                ) : (
                  Object.entries(statusCounts).map(([status, statusCount]) => (
                    <div key={status} className="flex items-center gap-2 text-sm">
                      <span
                        className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status] ?? 'bg-muted-foreground/50')}
                      />
                      <span className="flex-1">{STATUS_LABEL[status] ?? status}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">{statusCount}</span>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel className="flex-1">
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
          </div>
        </div>
      </div>
    </PageShell>
  )
}
