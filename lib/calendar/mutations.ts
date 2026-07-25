import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  calendarEventOverrides,
  calendarEvents,
  calendarShares,
  calendars,
  eventAttendees,
  eventReminders,
  notifications,
  type AttendeeResponse,
  type Calendar,
  type CalendarEvent,
  type InsertEventAttendee,
  type ReminderSpec,
} from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { ingestEvents } from '@/lib/events/ingest'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'
import { computeRecurrenceEnd, floatingUntil } from './recurrence'

export class CalendarError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export type EditScope = 'single' | 'following' | 'all'

export interface AttendeeInput {
  memberId?: string | null
  email?: string | null
  role?: 'required' | 'optional'
}

export interface EventInput {
  calendarId: string
  title: string
  description?: string | null
  location?: string | null
  color?: string | null
  startAt: Date
  endAt: Date
  timezone: string
  allDay?: boolean
  rrule?: string | null
  visibility?: CalendarEvent['visibility']
  transparency?: CalendarEvent['transparency']
  conferenceUrl?: string | null
  attendees?: AttendeeInput[]
  reminders?: ReminderSpec[]
}

// Write access to a calendar: the owner, or someone with a writer/owner share.
async function assertCanWrite(ctx: WorkspaceContext, calendarId: string): Promise<Calendar> {
  const [cal] = await db
    .select()
    .from(calendars)
    .where(and(eq(calendars.id, calendarId), eq(calendars.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!cal) throw new CalendarError('Calendar not found', 404)
  if (cal.externalProvider) throw new CalendarError('Imported calendars are read-only', 403)
  if (cal.ownerMemberId === ctx.member.id) return cal

  const [share] = await db
    .select()
    .from(calendarShares)
    .where(and(eq(calendarShares.calendarId, calendarId), eq(calendarShares.sharedWithMemberId, ctx.member.id)))
    .limit(1)
  if (share && (share.role === 'writer' || share.role === 'owner')) return cal
  throw new CalendarError('You do not have permission to edit this calendar', 403)
}

async function loadEvent(ctx: WorkspaceContext, eventId: string): Promise<CalendarEvent> {
  const [ev] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!ev) throw new CalendarError('Event not found', 404)
  return ev
}

// Append a Beacon event so the calendar feeds Pulse/Timeline. Fire-and-forget
// style: attributed to the organizer; guests get an inbox notification.
async function bridge(
  ctx: WorkspaceContext,
  type: 'meeting.scheduled' | 'meeting.held' | 'meeting.updated' | 'meeting.cancelled' | 'meeting.rsvp',
  ev: Pick<CalendarEvent, 'id' | 'calendarId' | 'title' | 'startAt' | 'endAt'>,
  notifyMemberIds: string[] = [],
): Promise<void> {
  const result = await ingestEvents(
    [
      {
        type,
        source: 'calendar',
        engineer: ctx.member.name,
        summary: `${bridgeVerb(type)} "${ev.title}"`.slice(0, 200),
        occurredAt: new Date(),
        payload: {
          calendarEventId: ev.id,
          calendarId: ev.calendarId,
          start: ev.startAt.toISOString(),
          end: ev.endAt.toISOString(),
        },
      },
    ],
    { workspaceId: ctx.workspaceId, defaultSource: 'calendar' },
  )
  const bridgeEventId = result.eventIds[0]
  const recipients = notifyMemberIds.filter((id) => id !== ctx.member.id)
  if (bridgeEventId && recipients.length > 0) {
    await db
      .insert(notifications)
      .values(
        recipients.map((memberId) => ({
          id: generateId(),
          workspaceId: ctx.workspaceId,
          memberId,
          eventId: bridgeEventId,
        })),
      )
      .onConflictDoNothing({ target: [notifications.memberId, notifications.eventId] })
  }
}

function bridgeVerb(type: string): string {
  switch (type) {
    case 'meeting.updated':
      return 'Updated'
    case 'meeting.cancelled':
      return 'Cancelled'
    case 'meeting.rsvp':
      return 'Responded to'
    default:
      return 'Scheduled'
  }
}

async function insertAttendees(
  workspaceId: string,
  eventId: string,
  organizerMemberId: string,
  attendees: AttendeeInput[],
): Promise<string[]> {
  const memberIds = new Set<string>()
  const rows: InsertEventAttendee[] = [
    {
      id: generateId(16),
      workspaceId,
      eventId,
      memberId: organizerMemberId,
      email: null,
      role: 'required',
      responseStatus: 'accepted',
      isOrganizer: true,
    },
  ]
  for (const a of attendees) {
    if (a.memberId) {
      if (a.memberId === organizerMemberId || memberIds.has(a.memberId)) continue
      memberIds.add(a.memberId)
      rows.push({
        id: generateId(16),
        workspaceId,
        eventId,
        memberId: a.memberId,
        email: null,
        role: a.role ?? 'required',
        responseStatus: 'needsAction',
        isOrganizer: false,
      })
    } else if (a.email) {
      rows.push({
        id: generateId(16),
        workspaceId,
        eventId,
        memberId: null,
        email: a.email,
        role: a.role ?? 'required',
        responseStatus: 'needsAction',
        isOrganizer: false,
      })
    }
  }
  await db.insert(eventAttendees).values(rows)
  return [...memberIds]
}

async function insertReminders(
  workspaceId: string,
  eventId: string,
  memberId: string,
  reminders: ReminderSpec[],
): Promise<void> {
  if (reminders.length === 0) return
  await db.insert(eventReminders).values(
    reminders.map((r) => ({
      id: generateId(16),
      workspaceId,
      eventId,
      memberId,
      method: r.method,
      minutesBefore: r.minutesBefore,
    })),
  )
}

export async function createEvent(ctx: WorkspaceContext, input: EventInput): Promise<CalendarEvent> {
  await assertCanWrite(ctx, input.calendarId)

  const id = generateId(16)
  const recurrenceEndAt = input.rrule
    ? computeRecurrenceEnd({
        rrule: input.rrule,
        startAt: input.startAt,
        endAt: input.endAt,
        startTimezone: input.timezone,
      })
    : null

  const [created] = await db
    .insert(calendarEvents)
    .values({
      id,
      workspaceId: ctx.workspaceId,
      calendarId: input.calendarId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      color: input.color ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      startTimezone: input.timezone,
      endTimezone: input.timezone,
      allDay: input.allDay ?? false,
      rrule: input.rrule ?? null,
      recurrenceEndAt,
      visibility: input.visibility ?? 'default',
      transparency: input.transparency ?? 'opaque',
      conferenceUrl: input.conferenceUrl ?? null,
      organizerMemberId: ctx.member.id,
      createdByMemberId: ctx.member.id,
    })
    .returning()

  const memberAttendees = await insertAttendees(ctx.workspaceId, id, ctx.member.id, input.attendees ?? [])
  await insertReminders(ctx.workspaceId, id, ctx.member.id, input.reminders ?? [])

  const type = input.startAt.getTime() < Date.now() && !input.rrule ? 'meeting.held' : 'meeting.scheduled'
  await bridge(ctx, type, created, memberAttendees)

  return created
}

export async function updateEvent(
  ctx: WorkspaceContext,
  eventId: string,
  scope: EditScope,
  recurrenceDate: Date | null,
  patch: Partial<EventInput>,
): Promise<void> {
  const master = await loadEvent(ctx, eventId)
  await assertCanWrite(ctx, master.calendarId)

  if (scope === 'all' || !master.rrule) {
    const startAt = patch.startAt ?? master.startAt
    const endAt = patch.endAt ?? master.endAt
    const rrule = patch.rrule !== undefined ? patch.rrule : master.rrule
    const timezone = patch.timezone ?? master.startTimezone
    await db
      .update(calendarEvents)
      .set({
        title: patch.title ?? master.title,
        description: patch.description !== undefined ? patch.description : master.description,
        location: patch.location !== undefined ? patch.location : master.location,
        color: patch.color !== undefined ? patch.color : master.color,
        startAt,
        endAt,
        startTimezone: timezone,
        endTimezone: timezone,
        allDay: patch.allDay ?? master.allDay,
        rrule,
        recurrenceEndAt: rrule ? computeRecurrenceEnd({ rrule, startAt, endAt, startTimezone: timezone }) : null,
        visibility: patch.visibility ?? master.visibility,
        transparency: patch.transparency ?? master.transparency,
        conferenceUrl: patch.conferenceUrl !== undefined ? patch.conferenceUrl : master.conferenceUrl,
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, eventId))
    await bridge(ctx, 'meeting.updated', { ...master, startAt, endAt, title: patch.title ?? master.title })
    return
  }

  if (!recurrenceDate) throw new CalendarError('recurrenceDate is required for single/following edits', 400)

  if (scope === 'single') {
    await db
      .insert(calendarEventOverrides)
      .values({
        id: generateId(16),
        workspaceId: ctx.workspaceId,
        masterEventId: eventId,
        recurrenceDate,
        cancelled: false,
        title: patch.title ?? null,
        description: patch.description ?? null,
        location: patch.location ?? null,
        startAt: patch.startAt ?? null,
        endAt: patch.endAt ?? null,
        allDay: patch.allDay ?? null,
        status: null,
      })
      .onConflictDoUpdate({
        target: [calendarEventOverrides.masterEventId, calendarEventOverrides.recurrenceDate],
        set: {
          cancelled: false,
          title: patch.title ?? null,
          description: patch.description ?? null,
          location: patch.location ?? null,
          startAt: patch.startAt ?? null,
          endAt: patch.endAt ?? null,
          allDay: patch.allDay ?? null,
          updatedAt: new Date(),
        },
      })
    await bridge(ctx, 'meeting.updated', { ...master, title: patch.title ?? master.title })
    return
  }

  // scope === 'following': end the old series before recurrenceDate, then create
  // a new master from the edited occurrence forward carrying the same rule.
  await endSeriesBefore(master, recurrenceDate)
  const newStart = patch.startAt ?? recurrenceDate
  const durationMs = (patch.endAt ?? master.endAt).getTime() - (patch.startAt ?? master.startAt).getTime()
  const newEnd = patch.endAt ?? new Date(newStart.getTime() + durationMs)
  const timezone = patch.timezone ?? master.startTimezone
  const newRrule = stripUntilCount(master.rrule)

  const newId = generateId(16)
  await db.insert(calendarEvents).values({
    id: newId,
    workspaceId: ctx.workspaceId,
    calendarId: master.calendarId,
    title: patch.title ?? master.title,
    description: patch.description !== undefined ? patch.description : master.description,
    location: patch.location !== undefined ? patch.location : master.location,
    color: patch.color !== undefined ? patch.color : master.color,
    startAt: newStart,
    endAt: newEnd,
    startTimezone: timezone,
    endTimezone: timezone,
    allDay: patch.allDay ?? master.allDay,
    rrule: newRrule,
    recurrenceEndAt: newRrule
      ? computeRecurrenceEnd({ rrule: newRrule, startAt: newStart, endAt: newEnd, startTimezone: timezone })
      : null,
    visibility: master.visibility,
    transparency: master.transparency,
    conferenceUrl: patch.conferenceUrl !== undefined ? patch.conferenceUrl : master.conferenceUrl,
    organizerMemberId: master.organizerMemberId,
    createdByMemberId: ctx.member.id,
  })
  await copyAttendeesAndReminders(ctx.workspaceId, master.id, newId)
  await bridge(ctx, 'meeting.updated', {
    ...master,
    id: newId,
    startAt: newStart,
    endAt: newEnd,
    title: patch.title ?? master.title,
  })
}

export async function deleteEvent(
  ctx: WorkspaceContext,
  eventId: string,
  scope: EditScope,
  recurrenceDate: Date | null,
): Promise<void> {
  const master = await loadEvent(ctx, eventId)
  await assertCanWrite(ctx, master.calendarId)

  if (scope === 'all' || !master.rrule) {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, eventId))
    await bridge(ctx, 'meeting.cancelled', master)
    return
  }
  if (!recurrenceDate) throw new CalendarError('recurrenceDate is required for single/following deletes', 400)

  if (scope === 'single') {
    await db
      .insert(calendarEventOverrides)
      .values({
        id: generateId(16),
        workspaceId: ctx.workspaceId,
        masterEventId: eventId,
        recurrenceDate,
        cancelled: true,
      })
      .onConflictDoUpdate({
        target: [calendarEventOverrides.masterEventId, calendarEventOverrides.recurrenceDate],
        set: { cancelled: true, updatedAt: new Date() },
      })
    await bridge(ctx, 'meeting.cancelled', master)
    return
  }

  // following
  await endSeriesBefore(master, recurrenceDate)
  await bridge(ctx, 'meeting.cancelled', master)
}

export async function rsvp(ctx: WorkspaceContext, eventId: string, response: AttendeeResponse): Promise<void> {
  const master = await loadEvent(ctx, eventId)
  const res = await db
    .update(eventAttendees)
    .set({ responseStatus: response, updatedAt: new Date() })
    .where(and(eq(eventAttendees.eventId, eventId), eq(eventAttendees.memberId, ctx.member.id)))
    .returning({ id: eventAttendees.id })
  if (res.length === 0) throw new CalendarError('You are not invited to this event', 403)
  const notify = master.organizerMemberId ? [master.organizerMemberId] : []
  await bridge(ctx, 'meeting.rsvp', master, notify)
}

export async function setReminders(ctx: WorkspaceContext, eventId: string, reminders: ReminderSpec[]): Promise<void> {
  await loadEvent(ctx, eventId)
  await db
    .delete(eventReminders)
    .where(and(eq(eventReminders.eventId, eventId), eq(eventReminders.memberId, ctx.member.id)))
  await insertReminders(ctx.workspaceId, eventId, ctx.member.id, reminders)
}

// Set/replace the master RRULE's UNTIL to just before `boundary`, ending the
// series there. Existing UNTIL/COUNT is stripped first.
async function endSeriesBefore(master: CalendarEvent, boundary: Date): Promise<void> {
  if (!master.rrule) return
  const until = floatingUntil(new Date(boundary.getTime() - 1000), master.startTimezone)
  const base = stripUntilCount(master.rrule)
  const newRrule = `${base};UNTIL=${until}`
  await db
    .update(calendarEvents)
    .set({
      rrule: newRrule,
      recurrenceEndAt: computeRecurrenceEnd({
        rrule: newRrule,
        startAt: master.startAt,
        endAt: master.endAt,
        startTimezone: master.startTimezone,
      }),
      updatedAt: new Date(),
    })
    .where(eq(calendarEvents.id, master.id))
}

function stripUntilCount(rrule: string | null): string {
  if (!rrule) return ''
  return rrule
    .split(';')
    .filter((part) => !/^UNTIL=/i.test(part) && !/^COUNT=/i.test(part))
    .join(';')
}

async function copyAttendeesAndReminders(workspaceId: string, fromEventId: string, toEventId: string): Promise<void> {
  const attendees = await db.select().from(eventAttendees).where(eq(eventAttendees.eventId, fromEventId))
  if (attendees.length > 0) {
    await db.insert(eventAttendees).values(
      attendees.map((a) => ({
        id: generateId(16),
        workspaceId,
        eventId: toEventId,
        memberId: a.memberId,
        email: a.email,
        role: a.role,
        responseStatus: a.responseStatus,
        isOrganizer: a.isOrganizer,
      })),
    )
  }
  const reminders = await db.select().from(eventReminders).where(eq(eventReminders.eventId, fromEventId))
  if (reminders.length > 0) {
    await db.insert(eventReminders).values(
      reminders.map((r) => ({
        id: generateId(16),
        workspaceId,
        eventId: toEventId,
        memberId: r.memberId,
        method: r.method,
        minutesBefore: r.minutesBefore,
      })),
    )
  }
}
