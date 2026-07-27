import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bot, Github, BookOpen, PenLine, Radio, Rocket } from 'lucide-react'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { visibleMemberIds } from '@/lib/auth/permissions'
import { countEvents, countEventsBySource, listEvents } from '@/lib/events/queries'
import { EventItem } from '@/components/events/event-item'
import { EmptyState, PageShell } from '@/components/page-shell'
import { Pagination, parsePage } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'
import type { Event } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Timeline' }

const PAGE_SIZE = 50

const SOURCE_FILTERS = [
  { value: '', label: 'All', icon: Radio },
  { value: 'github', label: 'GitHub', icon: Github },
  { value: 'agent', label: 'Agents', icon: Bot },
  { value: 'cicd', label: 'CI/CD', icon: Rocket },
  { value: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { value: 'manual', label: 'Manual', icon: PenLine },
] as const

function timelineHref(source: string | undefined, page: number) {
  const params = new URLSearchParams()
  if (source) params.set('source', source)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/timeline?${qs}` : '/timeline'
}

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; page?: string }>
}) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')

  const { source, page: rawPage } = await searchParams
  const page = parsePage(rawPage)

  const visible = await visibleMemberIds(ctx)
  const filters = { source: (source as Event['source']) || undefined, visibleMemberIds: visible }
  const [events, total, sourceCounts] = await Promise.all([
    listEvents(ctx.workspaceId, { ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countEvents(ctx.workspaceId, filters),
    countEventsBySource(ctx.workspaceId, { visibleMemberIds: visible }),
  ])
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const countBySource = new Map(sourceCounts.map((r) => [r.source, r.count]))
  const totalAll = sourceCounts.reduce((n, r) => n + r.count, 0)

  const byDay = new Map<string, typeof events>()
  for (const event of events) {
    const day = event.occurredAt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    const bucket = byDay.get(day) ?? []
    bucket.push(event)
    byDay.set(day, bucket)
  }

  return (
    <PageShell
      title="Timeline"
      description="Every signal, from every source, in order"
      fixed
      actions={
        <span className="rounded-full border bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground tabular-nums">
          {total.toLocaleString()} events
        </span>
      }
    >
      <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 lg:px-6">
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex h-8 items-center divide-x overflow-hidden rounded-md border text-xs font-medium">
            {SOURCE_FILTERS.map((filter) => {
              const active = (source ?? '') === filter.value
              const filterCount = filter.value ? (countBySource.get(filter.value as Event['source']) ?? 0) : totalAll
              return (
                <Link
                  key={filter.value}
                  href={timelineHref(filter.value, 1)}
                  className={cn(
                    'flex h-full items-center gap-1.5 px-2.5 transition-colors',
                    active
                      ? 'bg-beacon/10 text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <filter.icon className="h-3.5 w-3.5" />
                  {filter.label}
                  <span className="tabular-nums opacity-60">{filterCount}</span>
                </Link>
              )
            })}
          </div>
        </div>

        {events.length === 0 ? (
          <div className="flex flex-1 rounded-lg border border-dashed">
            <EmptyState
              title="No events"
              hint={
                <>
                  Add a{' '}
                  <Link href="/integrations" className="underline underline-offset-2">
                    signal source
                  </Link>{' '}
                  or POST events to <code className="font-mono">/api/events</code>.
                </>
              }
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-2">
            {Array.from(byDay.entries()).map(([day, dayEvents]) => (
              <section key={day}>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 py-2 backdrop-blur-sm">
                  <h2 className="micro-label">{day}</h2>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="divide-y rounded-b-lg border border-t-0 bg-card px-4 shadow-xs">
                  {dayEvents.map((event) => (
                    <EventItem key={event.id} event={event} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          hrefFor={(p) => timelineHref(source, p)}
          className="mt-2 shrink-0"
        />
      </div>
    </PageShell>
  )
}
