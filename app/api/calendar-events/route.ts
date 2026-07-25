import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { getOccurrences, getVisibleCalendars } from '@/lib/calendar/queries'
import { createEvent, CalendarError, type AttendeeInput } from '@/lib/calendar/mutations'
import type { ReminderSpec } from '@/lib/db/schema'

export async function GET(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const startParam = url.searchParams.get('start')
  const endParam = url.searchParams.get('end')
  const start = startParam ? new Date(startParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const end = endParam ? new Date(endParam) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return Response.json({ error: 'Invalid start/end' }, { status: 400 })
  }

  const visible = await getVisibleCalendars(ctx)
  const requested = url.searchParams.get('calendarIds')
  const requestedSet = requested ? new Set(requested.split(',').filter(Boolean)) : null
  const calendarIds = visible.filter((c) => !requestedSet || requestedSet.has(c.id)).map((c) => c.id)

  const occurrences = await getOccurrences(ctx, calendarIds, start, end)
  return Response.json({
    events: occurrences.map((o) => ({
      id: o.instanceId,
      masterId: o.masterId,
      calendarId: o.calendarId,
      title: o.title,
      start: o.start.toISOString(),
      end: o.end.toISOString(),
      allDay: o.allDay,
      color: o.color,
      location: o.location,
      status: o.status,
      isRecurring: o.isRecurring,
      originalStart: o.originalStart?.toISOString() ?? null,
      attendeeCount: o.attendeeCount,
      myResponse: o.myResponse,
      readOnly: o.readOnly,
      conferenceUrl: o.conferenceUrl,
    })),
  })
}

const attendeeSchema = z.object({
  memberId: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  role: z.enum(['required', 'optional']).optional(),
})

const reminderSchema = z.object({
  method: z.enum(['popup', 'email']),
  minutesBefore: z.number().int().min(0).max(40320),
})

const createSchema = z.object({
  calendarId: z.string().min(1),
  title: z.string().max(500).default('(No title)'),
  description: z.string().max(8000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  start: z.string(),
  end: z.string(),
  timezone: z.string().min(1),
  allDay: z.boolean().optional(),
  rrule: z.string().max(1000).optional().nullable(),
  visibility: z.enum(['default', 'public', 'private']).optional(),
  transparency: z.enum(['opaque', 'transparent']).optional(),
  conferenceUrl: z.string().max(1000).optional().nullable(),
  attendees: z.array(attendeeSchema).max(200).optional(),
  reminders: z.array(reminderSchema).max(10).optional(),
})

export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const startAt = new Date(parsed.data.start)
  const endAt = new Date(parsed.data.end)
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt < startAt) {
    return Response.json({ error: 'Invalid start/end' }, { status: 400 })
  }

  try {
    const created = await createEvent(ctx, {
      calendarId: parsed.data.calendarId,
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      color: parsed.data.color,
      startAt,
      endAt,
      timezone: parsed.data.timezone,
      allDay: parsed.data.allDay,
      rrule: parsed.data.rrule,
      visibility: parsed.data.visibility,
      transparency: parsed.data.transparency,
      conferenceUrl: parsed.data.conferenceUrl,
      attendees: (parsed.data.attendees ?? []) as AttendeeInput[],
      reminders: (parsed.data.reminders ?? []) as ReminderSpec[],
    })
    return Response.json({ event: { id: created.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof CalendarError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }
}
