import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { visibleMemberIds } from '@/lib/auth/permissions'
import { countEvents, listEvents } from '@/lib/events/queries'
import { EventItem } from '@/components/events/event-item'
import { EmptyState, PageShell } from '@/components/page-shell'
import { Pagination, parsePage } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'
import type { Event } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Timeline' }

const PAGE_SIZE = 50

const SOURCE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'github', label: 'GitHub' },
  { value: 'linear', label: 'Linear' },
  { value: 'agent', label: 'Agents' },
  { value: 'cicd', label: 'CI/CD' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'manual', label: 'Manual' },
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
  const [events, total] = await Promise.all([
    listEvents(ctx.workspaceId, { ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countEvents(ctx.workspaceId, filters),
  ])
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const byDay = new Map<string, typeof events>()
  for (const event of events) {
    const day = event.occurredAt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    const bucket = byDay.get(day) ?? []
    bucket.push(event)
    byDay.set(day, bucket)
  }

  return (
    <PageShell title="Timeline" description="Every signal, from every source, in order">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 lg:px-6">
        <div className="mb-5 flex flex-wrap gap-1.5">
          {SOURCE_FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={timelineHref(filter.value, 1)}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
                (source ?? '') === filter.value
                  ? 'border-beacon/50 bg-beacon/10 text-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {filter.label}
            </Link>
          ))}
        </div>

        {events.length === 0 ? (
          <div className="flex rounded-lg border border-dashed">
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
          <div className="space-y-6">
            {Array.from(byDay.entries()).map(([day, dayEvents]) => (
              <section key={day}>
                <h2 className="micro-label sticky top-0 z-10 bg-background py-2">{day}</h2>
                <div className="divide-y rounded-lg border bg-card px-4">
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
          className="mt-2"
        />
      </div>
    </PageShell>
  )
}
