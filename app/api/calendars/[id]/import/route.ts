import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { CalendarError, createEvent } from '@/lib/calendar/mutations'
import { parseIcs } from '@/lib/calendar/ics'

const schema = z.object({ ics: z.string().min(1).max(5_000_000) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'An .ics payload is required' }, { status: 400 })

  let events
  try {
    events = parseIcs(parsed.data.ics)
  } catch {
    return Response.json({ error: 'Could not parse the .ics file' }, { status: 400 })
  }

  let imported = 0
  try {
    for (const ev of events) {
      await createEvent(ctx, {
        calendarId: id,
        title: ev.title,
        description: ev.description,
        location: ev.location,
        startAt: ev.start,
        endAt: ev.end,
        timezone: ev.timezone,
        allDay: ev.allDay,
        rrule: ev.rrule,
        attendees: ev.attendees.filter((a) => a.email).map((a) => ({ email: a.email })),
      })
      imported++
    }
  } catch (err) {
    if (err instanceof CalendarError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }

  return Response.json({ ok: true, imported })
}
