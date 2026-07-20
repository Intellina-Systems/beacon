import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, count, desc, eq, isNull, lte, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { events, members, notifications, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { PageShell } from '@/components/page-shell'
import { Pagination, parsePage } from '@/components/ui/pagination'
import { InboxList } from '@/components/notifications/inbox-list'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inbox' }

const PAGE_SIZE = 50
const FILTERS = ['active', 'unread', 'all'] as const
type Filter = (typeof FILTERS)[number]

function inboxHref(filter: Filter, page: number) {
  const params = new URLSearchParams()
  if (filter !== 'active') params.set('filter', filter)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/inbox?${qs}` : '/inbox'
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>
}) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')

  const { filter: rawFilter, page: rawPage } = await searchParams
  const filter: Filter = FILTERS.includes(rawFilter as Filter) ? (rawFilter as Filter) : 'active'
  const page = parsePage(rawPage)

  const base = [eq(notifications.workspaceId, ctx.workspaceId), eq(notifications.memberId, ctx.member.id)]
  const conditions =
    filter === 'unread'
      ? [...base, isNull(notifications.readAt)]
      : filter === 'active'
        ? [
            ...base,
            isNull(notifications.readAt),
            or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, new Date())),
          ]
        : base

  const [rows, totalRow, unreadRow, roster] = await Promise.all([
    db
      .select({
        id: notifications.id,
        readAt: notifications.readAt,
        snoozedUntil: notifications.snoozedUntil,
        createdAt: notifications.createdAt,
        eventType: events.type,
        eventSource: events.source,
        eventSummary: events.summary,
        actorLabel: events.actorLabel,
        occurredAt: events.occurredAt,
        workItemId: workItems.id,
        workItemKey: workItems.key,
        workItemTitle: workItems.title,
      })
      .from(notifications)
      .innerJoin(events, eq(events.id, notifications.eventId))
      .leftJoin(workItems, eq(workItems.id, notifications.workItemId))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(...conditions)),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(...base, isNull(notifications.readAt))),
    db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(eq(members.workspaceId, ctx.workspaceId))
      .orderBy(members.name),
  ])

  const total = totalRow[0]?.value ?? 0
  const unreadCount = unreadRow[0]?.value ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const TAB_LABEL: Record<Filter, string> = { active: 'Active', unread: 'Unread', all: 'All' }

  return (
    <PageShell title="Inbox" description="Events on work items you watch">
      <div className="mx-auto w-full max-w-3xl px-4 py-5 lg:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={inboxHref(f, 1)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
                  filter === f
                    ? 'border-beacon/50 bg-beacon/10 text-foreground'
                    : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
                )}
              >
                {TAB_LABEL[f]}
                {f === 'unread' && unreadCount > 0 && <span className="tabular-nums opacity-70">{unreadCount}</span>}
              </Link>
            ))}
          </div>
        </div>

        <InboxList initialRows={rows} roster={roster} currentMemberId={ctx.member.id} />

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          hrefFor={(p) => inboxHref(filter, p)}
          className="mt-2"
        />
      </div>
    </PageShell>
  )
}
