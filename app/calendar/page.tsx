import { redirect } from 'next/navigation'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ensurePrimaryCalendar, getVisibleCalendars } from '@/lib/calendar/queries'
import { PageShell } from '@/components/page-shell'
import { CalendarAppLoader } from '@/components/calendar/calendar-app-loader'
import { TimezoneCapture } from '@/components/calendar/timezone-capture'
import type { CalendarSummary, RosterMember } from '@/components/calendar/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Calendar' }

export default async function CalendarPage() {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')

  await ensurePrimaryCalendar(ctx)
  const [visible, roster] = await Promise.all([
    getVisibleCalendars(ctx),
    db
      .select({ id: members.id, name: members.name, email: members.email })
      .from(members)
      .where(and(eq(members.workspaceId, ctx.workspaceId), ne(members.id, ctx.member.id)))
      .orderBy(members.name),
  ])

  const calendars: CalendarSummary[] = visible.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    timezone: c.timezone,
    isPrimary: c.isPrimary,
    visibility: c.visibility,
    mine: c.ownerMemberId === ctx.member.id,
    externalProvider: c.externalProvider,
    readOnly: Boolean(c.externalProvider),
  }))

  const defaultTimezone = ctx.member.timezone ?? 'UTC'

  return (
    <PageShell title="Calendar" description={`${ctx.workspaceName} · your schedule`} fixed>
      <TimezoneCapture hasTimezone={Boolean(ctx.member.timezone)} />
      <CalendarAppLoader calendars={calendars} roster={roster as RosterMember[]} defaultTimezone={defaultTimezone} />
    </PageShell>
  )
}
