import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { isAdmin } from '@/lib/auth/permissions'
import { getPlansHistory } from '@/lib/plans/queries'
import { PageShell } from '@/components/page-shell'
import { PlansHistoryTable } from '@/components/plans/plans-history-table'
import { TimelinePersonFilter } from '@/components/events/timeline-person-filter'
import { TimelineDateRangeFilter } from '@/components/events/timeline-date-range-filter'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Plans' }

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string; from?: string; to?: string }>
}) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  if (!isAdmin(ctx)) redirect('/pulse')

  const { member: rawMember, from, to } = await searchParams

  // This page is already admin-only, so unlike Timeline's manager-scoped
  // roster there's no visibility narrowing to do here — every workspace
  // member is a valid filter target.
  const roster = await db
    .select({ id: members.id, name: members.name })
    .from(members)
    .where(eq(members.workspaceId, ctx.workspaceId))
    .orderBy(members.name)
  const member = rawMember && roster.some((m) => m.id === rawMember) ? rawMember : undefined

  const history = await getPlansHistory(ctx.workspaceId, { memberId: member, from, to })

  return (
    <PageShell title="Plans" description="Every member's daily plan, done or pending" fixed>
      <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 lg:px-6">
        <div className="mb-3 flex shrink-0 items-center justify-end gap-2">
          <TimelinePersonFilter roster={roster} current={member} basePath="/plans" />
          <TimelineDateRangeFilter from={from} to={to} basePath="/plans" />
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
          <PlansHistoryTable rows={history} />
        </div>
      </div>
    </PageShell>
  )
}
