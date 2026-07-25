import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { calendarEventOverrides, calendarEvents, calendars, eventAttendees, members } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { getVisibleCalendars } from '@/lib/calendar/queries'
import { generateIcs, type IcsEventInput } from '@/lib/calendar/ics'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const visible = await getVisibleCalendars(ctx)
  const cal = visible.find((c) => c.id === id)
  if (!cal) return Response.json({ error: 'Not found' }, { status: 404 })

  const events = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.calendarId, id), eq(calendarEvents.workspaceId, ctx.workspaceId)))

  const eventIds = events.map((e) => e.id)
  const overrides = eventIds.length
    ? await db.select().from(calendarEventOverrides).where(inArray(calendarEventOverrides.masterEventId, eventIds))
    : []
  const attendeeRows = eventIds.length
    ? await db
        .select({
          eventId: eventAttendees.eventId,
          email: eventAttendees.email,
          memberEmail: members.email,
          name: members.name,
          response: eventAttendees.responseStatus,
        })
        .from(eventAttendees)
        .leftJoin(members, eq(members.id, eventAttendees.memberId))
        .where(inArray(eventAttendees.eventId, eventIds))
    : []

  const overridesByEvent = new Map<string, typeof overrides>()
  for (const o of overrides) {
    const list = overridesByEvent.get(o.masterEventId) ?? []
    list.push(o)
    overridesByEvent.set(o.masterEventId, list)
  }
  const attendeesByEvent = new Map<string, IcsEventInput['attendees']>()
  for (const a of attendeeRows) {
    const email = a.email ?? a.memberEmail
    if (!email) continue
    const list = attendeesByEvent.get(a.eventId) ?? []
    list!.push({ email, name: a.name ?? undefined, responseStatus: a.response })
    attendeesByEvent.set(a.eventId, list)
  }

  const icsEvents: IcsEventInput[] = events.map((e) => {
    const evOverrides = overridesByEvent.get(e.id) ?? []
    return {
      uid: `${e.id}@beacon`,
      title: e.title,
      description: e.description,
      location: e.location,
      start: e.startAt,
      end: e.endAt,
      allDay: e.allDay,
      rrule: e.rrule,
      status: e.status,
      attendees: attendeesByEvent.get(e.id) ?? [],
      exdates: evOverrides.filter((o) => o.cancelled).map((o) => o.recurrenceDate),
      overrides: evOverrides
        .filter((o) => !o.cancelled && o.startAt)
        .map((o) => ({
          recurrenceId: o.recurrenceDate,
          start: o.startAt as Date,
          end: (o.endAt ?? new Date(o.startAt!.getTime() + (e.endAt.getTime() - e.startAt.getTime()))) as Date,
          title: o.title,
        })),
    }
  })

  const ics = generateIcs(icsEvents, cal.name)
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${cal.name.replace(/[^a-z0-9]+/gi, '-')}.ics"`,
    },
  })
}
