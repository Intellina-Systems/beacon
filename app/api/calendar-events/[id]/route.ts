import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { calendarEvents, eventAttendees, eventReminders, members } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { getVisibleCalendars } from '@/lib/calendar/queries'
import { CalendarError, deleteEvent, updateEvent, type AttendeeInput, type EditScope } from '@/lib/calendar/mutations'

async function GET_detail(ctx: Awaited<ReturnType<typeof getWorkspaceContext>>, id: string) {
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.workspaceId, ctx!.workspaceId)))
    .limit(1)
  if (!event) return null
  const attendees = await db
    .select({
      id: eventAttendees.id,
      memberId: eventAttendees.memberId,
      email: eventAttendees.email,
      name: members.name,
      role: eventAttendees.role,
      responseStatus: eventAttendees.responseStatus,
      isOrganizer: eventAttendees.isOrganizer,
    })
    .from(eventAttendees)
    .leftJoin(members, eq(members.id, eventAttendees.memberId))
    .where(eq(eventAttendees.eventId, id))
  const reminders = await db
    .select({ method: eventReminders.method, minutesBefore: eventReminders.minutesBefore })
    .from(eventReminders)
    .where(and(eq(eventReminders.eventId, id), eq(eventReminders.memberId, ctx!.member.id)))
  return { event, attendees, reminders }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const detail = await GET_detail(ctx, id)
  if (!detail) return Response.json({ error: 'Not found' }, { status: 404 })

  // Read scope: the event must be on a calendar the viewer can see.
  const visibleIds = new Set((await getVisibleCalendars(ctx)).map((c) => c.id))
  if (!visibleIds.has(detail.event.calendarId)) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json(detail)
}

const patchSchema = z.object({
  scope: z.enum(['single', 'following', 'all']).default('all'),
  recurrenceDate: z.string().optional().nullable(),
  title: z.string().max(500).optional(),
  description: z.string().max(8000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  start: z.string().optional(),
  end: z.string().optional(),
  timezone: z.string().optional(),
  allDay: z.boolean().optional(),
  rrule: z.string().max(1000).optional().nullable(),
  visibility: z.enum(['default', 'public', 'private']).optional(),
  transparency: z.enum(['opaque', 'transparent']).optional(),
  conferenceUrl: z.string().max(1000).optional().nullable(),
  attendees: z
    .array(
      z.object({
        memberId: z.string().nullish(),
        email: z.string().email().nullish(),
        role: z.enum(['required', 'optional']).optional(),
      }),
    )
    .optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  const d = parsed.data

  try {
    await updateEvent(ctx, id, d.scope as EditScope, d.recurrenceDate ? new Date(d.recurrenceDate) : null, {
      title: d.title,
      description: d.description,
      location: d.location,
      color: d.color,
      startAt: d.start ? new Date(d.start) : undefined,
      endAt: d.end ? new Date(d.end) : undefined,
      timezone: d.timezone,
      allDay: d.allDay,
      rrule: d.rrule,
      visibility: d.visibility,
      transparency: d.transparency,
      conferenceUrl: d.conferenceUrl,
      attendees: d.attendees as AttendeeInput[] | undefined,
    })
    return Response.json({ ok: true })
  } catch (err) {
    if (err instanceof CalendarError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const url = new URL(req.url)
  const scope = (url.searchParams.get('scope') ?? 'all') as EditScope
  const recurrenceDateParam = url.searchParams.get('recurrenceDate')

  try {
    await deleteEvent(ctx, id, scope, recurrenceDateParam ? new Date(recurrenceDateParam) : null)
    return Response.json({ ok: true })
  } catch (err) {
    if (err instanceof CalendarError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }
}
