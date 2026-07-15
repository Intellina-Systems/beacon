import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq, inArray } from 'drizzle-orm'
import { AlertTriangle, Activity, Bot, GitMerge, Users } from 'lucide-react'
import { db } from '@/lib/db/client'
import { members, workItems } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getActiveBlockers, getDailyActivity, getMemberActivity, getPulse, listEvents } from '@/lib/events/queries'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EventItem } from '@/components/events/event-item'
import { relativeTime } from '@/lib/utils/relative-time'

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

export default async function PulsePage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/')
  const userId = session.user.id

  const [pulse, blockers, recentEvents, dailyActivity, memberActivity, roster, activeItems] = await Promise.all([
    getPulse(userId, 7),
    getActiveBlockers(userId),
    listEvents(userId, { limit: 12 }),
    getDailyActivity(userId, 14),
    getMemberActivity(userId, 7),
    db.select().from(members).where(eq(members.userId, userId)).orderBy(members.name),
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

  const maxDaily = Math.max(1, ...dailyActivity.map((d) => d.count))

  const stats = [
    { icon: Activity, label: 'Events this week', value: pulse.totalEvents },
    { icon: GitMerge, label: 'PRs merged', value: pulse.prsMerged },
    { icon: Users, label: 'Active engineers', value: pulse.activeMemberIds.length },
    { icon: Bot, label: 'Agent events', value: pulse.byCategory.agent },
  ]

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pulse</h1>
        <p className="text-sm text-muted-foreground mt-1">What&apos;s happening across engineering, right now.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </div>
              <p className="text-2xl font-bold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Activity — last 14 days</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No events yet. Connect a source or point an agent at the events API to light this up.
                </p>
              ) : (
                <div className="flex items-end gap-1 h-24">
                  {dailyActivity.map((day) => (
                    <div
                      key={day.day}
                      className="flex-1 flex flex-col items-center gap-1"
                      title={`${day.day}: ${day.count}`}
                    >
                      <div
                        className="w-full rounded-sm bg-primary/70 min-h-[2px]"
                        style={{ height: `${Math.round((day.count / maxDaily) * 88)}px` }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Latest events</CardTitle>
              <Link href="/timeline" className="text-xs text-muted-foreground hover:text-foreground">
                Full timeline →
              </Link>
            </CardHeader>
            <CardContent className="divide-y">
              {recentEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nothing yet.</p>
              ) : (
                recentEvents.map((event) => <EventItem key={event.id} event={event} />)
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className={blockers.length > 0 ? 'border-red-500/40' : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Blockers
                <Badge variant={blockers.length > 0 ? 'destructive' : 'outline'} className="ml-auto">
                  {blockers.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {blockers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody is blocked. 🎉</p>
              ) : (
                blockers.slice(0, 6).map((blocker) => (
                  <div key={blocker.event.id} className="text-sm">
                    <p className="leading-snug">{blocker.event.summary}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[blocker.member?.name, relativeTime(blocker.event.occurredAt)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Work in flight</CardTitle>
              <Link href="/work" className="text-xs text-muted-foreground hover:text-foreground">
                All work →
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active work items.</p>
              ) : (
                Object.entries(statusCounts).map(([status, statusCount]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span>{STATUS_LABEL[status] ?? status}</span>
                    <span className="tabular-nums text-muted-foreground">{statusCount}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Team</CardTitle>
              <Link href="/team" className="text-xs text-muted-foreground hover:text-foreground">
                Roster →
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {roster.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
              ) : (
                roster.slice(0, 8).map((member) => {
                  const activity = memberActivity.get(member.id)
                  return (
                    <Link
                      key={member.id}
                      href={`/team/${member.id}`}
                      className="flex items-center justify-between text-sm hover:text-foreground"
                    >
                      <span>{member.name}</span>
                      <span className="tabular-nums text-muted-foreground text-xs">
                        {activity ? `${activity.total} events` : 'quiet'}
                      </span>
                    </Link>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
