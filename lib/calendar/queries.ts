import 'server-only'

import { and, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  calendarEventOverrides,
  calendarEvents,
  calendarShares,
  calendars,
  eventAttendees,
  members,
  type Calendar,
  type CalendarEvent,
  type CalendarEventOverride,
} from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'
import { expandEvents, type EventOccurrence } from './recurrence'

// Overrides grouped masterId → (recurrence instant ISO → row), the shape
// expandEvents expects.
export async function loadOverridesByMaster(
  masterIds: string[],
): Promise<Map<string, Map<string, CalendarEventOverride>>> {
  const byMaster = new Map<string, Map<string, CalendarEventOverride>>()
  if (masterIds.length === 0) return byMaster
  const rows = await db
    .select()
    .from(calendarEventOverrides)
    .where(inArray(calendarEventOverrides.masterEventId, masterIds))
  for (const row of rows) {
    const inner = byMaster.get(row.masterEventId) ?? new Map<string, CalendarEventOverride>()
    inner.set(row.recurrenceDate.toISOString(), row)
    byMaster.set(row.masterEventId, inner)
  }
  return byMaster
}

// Every calendar this viewer may see: their own, workspace-visible ones, and
// calendars explicitly shared with them.
export async function getVisibleCalendars(ctx: WorkspaceContext): Promise<Calendar[]> {
  const rows = await db
    .select({ cal: calendars })
    .from(calendars)
    .leftJoin(calendarShares, eq(calendarShares.calendarId, calendars.id))
    .where(
      and(
        eq(calendars.workspaceId, ctx.workspaceId),
        or(
          eq(calendars.ownerMemberId, ctx.member.id),
          eq(calendars.visibility, 'workspace'),
          eq(calendarShares.sharedWithMemberId, ctx.member.id),
        ),
      ),
    )
  const byId = new Map<string, Calendar>()
  for (const row of rows) byId.set(row.cal.id, row.cal)
  return [...byId.values()].sort((a, b) =>
    a.isPrimary === b.isPrimary ? a.name.localeCompare(b.name) : a.isPrimary ? -1 : 1,
  )
}

// The viewer's primary calendar, created lazily on first use. Everyone gets one
// named after them, in their captured timezone.
export async function ensurePrimaryCalendar(ctx: WorkspaceContext): Promise<Calendar> {
  const [existing] = await db
    .select()
    .from(calendars)
    .where(
      and(
        eq(calendars.workspaceId, ctx.workspaceId),
        eq(calendars.ownerMemberId, ctx.member.id),
        eq(calendars.isPrimary, true),
      ),
    )
    .limit(1)
  if (existing) return existing

  const [created] = await db
    .insert(calendars)
    .values({
      id: generateId(16),
      workspaceId: ctx.workspaceId,
      ownerMemberId: ctx.member.id,
      name: ctx.member.name,
      color: '#3b82f6',
      timezone: ctx.member.timezone ?? 'UTC',
      isPrimary: true,
      visibility: 'private',
    })
    .returning()
  return created
}

// Coarse DB prefilter for masters that might produce an occurrence in the
// window; expandEvents does the exact overlap test. Prunes old single events
// and finished recurrences.
export async function loadMastersInRange(
  workspaceId: string,
  calendarIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<CalendarEvent[]> {
  if (calendarIds.length === 0) return []
  return db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.workspaceId, workspaceId),
        inArray(calendarEvents.calendarId, calendarIds),
        ne(calendarEvents.status, 'cancelled'),
        lte(calendarEvents.startAt, rangeEnd),
        // finished recurrences pruned by cached end; single past events pruned by endAt
        or(isNull(calendarEvents.recurrenceEndAt), gte(calendarEvents.recurrenceEndAt, rangeStart)),
        or(sql`${calendarEvents.rrule} is not null`, gte(calendarEvents.endAt, rangeStart)),
      ),
    )
}

export interface OccurrenceWithMeta extends EventOccurrence {
  calendarName: string
  calendarColor: string
  attendeeCount: number
  myResponse: string | null
}

// The main calendar feed: expanded occurrences across the given calendars in a
// window, enriched with calendar color and the viewer's own RSVP.
export async function getOccurrences(
  ctx: WorkspaceContext,
  calendarIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<OccurrenceWithMeta[]> {
  const masters = await loadMastersInRange(ctx.workspaceId, calendarIds, rangeStart, rangeEnd)
  if (masters.length === 0) return []

  const overrides = await loadOverridesByMaster(masters.filter((m) => m.rrule).map((m) => m.id))
  const occurrences = expandEvents(masters, overrides, rangeStart, rangeEnd)

  const calendarById = new Map<string, Calendar>()
  const calRows = await db
    .select()
    .from(calendars)
    .where(inArray(calendars.id, [...new Set(masters.map((m) => m.calendarId))]))
  for (const c of calRows) calendarById.set(c.id, c)

  // Attendee counts + the viewer's RSVP, per master.
  const masterIds = masters.map((m) => m.id)
  const attendeeRows = await db
    .select({
      eventId: eventAttendees.eventId,
      memberId: eventAttendees.memberId,
      response: eventAttendees.responseStatus,
    })
    .from(eventAttendees)
    .where(inArray(eventAttendees.eventId, masterIds))
  const countByEvent = new Map<string, number>()
  const myResponseByEvent = new Map<string, string>()
  for (const row of attendeeRows) {
    countByEvent.set(row.eventId, (countByEvent.get(row.eventId) ?? 0) + 1)
    if (row.memberId === ctx.member.id) myResponseByEvent.set(row.eventId, row.response)
  }

  return occurrences.map((occ) => {
    const cal = calendarById.get(occ.calendarId)
    return {
      ...occ,
      calendarName: cal?.name ?? '',
      calendarColor: cal?.color ?? '#3b82f6',
      color: occ.color ?? cal?.color ?? '#3b82f6',
      attendeeCount: countByEvent.get(occ.masterId) ?? 0,
      myResponse: myResponseByEvent.get(occ.masterId) ?? null,
    }
  })
}

// Resolve internal-member attendees to display names for a single event.
export async function getEventAttendeeNames(eventId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ memberId: eventAttendees.memberId, name: members.name })
    .from(eventAttendees)
    .leftJoin(members, eq(members.id, eventAttendees.memberId))
    .where(eq(eventAttendees.eventId, eventId))
  const map = new Map<string, string>()
  for (const row of rows) if (row.memberId && row.name) map.set(row.memberId, row.name)
  return map
}
