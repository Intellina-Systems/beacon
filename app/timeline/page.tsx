import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session/get-server-session'
import { listEvents } from '@/lib/events/queries'
import { EventItem } from '@/components/events/event-item'
import { cn } from '@/lib/utils'
import type { Event } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

const SOURCE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'github', label: 'GitHub' },
  { value: 'linear', label: 'Linear' },
  { value: 'agent', label: 'Agents' },
  { value: 'cicd', label: 'CI/CD' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'manual', label: 'Manual' },
] as const

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; days?: string }>
}) {
  const session = await getServerSession()
  if (!session?.user) redirect('/')

  const { source, days } = await searchParams
  const sinceDays = days ? Number(days) : 14

  const events = await listEvents(session.user.id, {
    sinceDays,
    source: (source as Event['source']) || undefined,
    limit: 200,
  })

  // Group by day for scannability
  const byDay = new Map<string, typeof events>()
  for (const event of events) {
    const day = event.occurredAt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    const bucket = byDay.get(day) ?? []
    bucket.push(event)
    byDay.set(day, bucket)
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Timeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          The event stream — every signal, from every source, in order.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {SOURCE_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/timeline?source=${filter.value}` : '/timeline'}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              (source ?? '') === filter.value
                ? 'bg-foreground text-background border-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 border rounded-md border-dashed">
          <p className="text-muted-foreground">No events in the last {sinceDays} days.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add a{' '}
            <Link href="/integrations" className="underline">
              signal source
            </Link>{' '}
            or POST events to <code className="font-mono text-xs">/api/events</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(byDay.entries()).map(([day, dayEvents]) => (
            <div key={day}>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-background py-2">
                {day}
              </h2>
              <div className="divide-y border rounded-md px-4">
                {dayEvents.map((event) => (
                  <EventItem key={event.id} event={event} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
