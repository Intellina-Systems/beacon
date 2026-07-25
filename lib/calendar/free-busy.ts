import 'server-only'

import { and, eq, inArray, lte, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { calendarEvents, eventAttendees, type CalendarEvent } from '@/lib/db/schema'
import { expandEvents } from './recurrence'
import { loadOverridesByMaster } from './queries'

export interface Interval {
  start: Date
  end: Date
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: Interval[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const cur = sorted[i]
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

// Busy intervals per member: events they organize or are invited to (not
// declined), that count as busy (opaque, not cancelled), within the window.
export async function getBusyIntervals(
  workspaceId: string,
  memberIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Map<string, Interval[]>> {
  const result = new Map<string, Interval[]>()
  if (memberIds.length === 0) return result

  const organizerEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.workspaceId, workspaceId),
        inArray(calendarEvents.organizerMemberId, memberIds),
        ne(calendarEvents.status, 'cancelled'),
        eq(calendarEvents.transparency, 'opaque'),
        lte(calendarEvents.startAt, rangeEnd),
      ),
    )

  const attendeeRows = await db
    .select({ event: calendarEvents, memberId: eventAttendees.memberId })
    .from(eventAttendees)
    .innerJoin(calendarEvents, eq(calendarEvents.id, eventAttendees.eventId))
    .where(
      and(
        eq(eventAttendees.workspaceId, workspaceId),
        inArray(eventAttendees.memberId, memberIds),
        ne(eventAttendees.responseStatus, 'declined'),
        ne(calendarEvents.status, 'cancelled'),
        eq(calendarEvents.transparency, 'opaque'),
        lte(calendarEvents.startAt, rangeEnd),
      ),
    )

  const mastersById = new Map<string, CalendarEvent>()
  const membersByEvent = new Map<string, Set<string>>()
  const attach = (ev: CalendarEvent, memberId: string) => {
    mastersById.set(ev.id, ev)
    const set = membersByEvent.get(ev.id) ?? new Set<string>()
    set.add(memberId)
    membersByEvent.set(ev.id, set)
  }
  for (const ev of organizerEvents) if (ev.organizerMemberId) attach(ev, ev.organizerMemberId)
  for (const row of attendeeRows) if (row.memberId) attach(row.event, row.memberId)

  const masters = [...mastersById.values()].filter((m) => !m.recurrenceEndAt || m.recurrenceEndAt >= rangeStart)
  const overrides = await loadOverridesByMaster(masters.filter((m) => m.rrule).map((m) => m.id))
  const occurrences = expandEvents(masters, overrides, rangeStart, rangeEnd)

  const perMember = new Map<string, Interval[]>()
  for (const occ of occurrences) {
    const evMembers = membersByEvent.get(occ.masterId)
    if (!evMembers) continue
    for (const memberId of evMembers) {
      const list = perMember.get(memberId) ?? []
      list.push({ start: occ.start, end: occ.end })
      perMember.set(memberId, list)
    }
  }

  for (const memberId of memberIds) result.set(memberId, mergeIntervals(perMember.get(memberId) ?? []))
  return result
}

export interface WorkingHours {
  // 0=Sun … 6=Sat → [startHour, endHour] in the given tz; absent day = off.
  startHour: number
  endHour: number
  days: number[]
}

const DEFAULT_WORKING_HOURS: WorkingHours = { startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5] }

// Suggested meeting slots: scan the window in stepMinutes increments and return
// the first N slots of length durationMin where every required member is free.
export async function findMeetingTimes(params: {
  workspaceId: string
  memberIds: string[]
  durationMin: number
  rangeStart: Date
  rangeEnd: Date
  stepMinutes?: number
  maxSuggestions?: number
  workingHours?: WorkingHours
}): Promise<Interval[]> {
  const {
    workspaceId,
    memberIds,
    durationMin,
    rangeStart,
    rangeEnd,
    stepMinutes = 30,
    maxSuggestions = 10,
    workingHours = DEFAULT_WORKING_HOURS,
  } = params

  const busyByMember = await getBusyIntervals(workspaceId, memberIds, rangeStart, rangeEnd)
  const allBusy = mergeIntervals([...busyByMember.values()].flat())
  const durationMs = durationMin * 60 * 1000
  const stepMs = stepMinutes * 60 * 1000

  const suggestions: Interval[] = []
  const isBusy = (start: number, end: number) => allBusy.some((b) => b.start.getTime() < end && b.end.getTime() > start)
  const inWorkingHours = (d: Date) => {
    const hour = d.getHours()
    return workingHours.days.includes(d.getDay()) && hour >= workingHours.startHour && hour < workingHours.endHour
  }

  for (let t = rangeStart.getTime(); t + durationMs <= rangeEnd.getTime(); t += stepMs) {
    const start = new Date(t)
    const end = new Date(t + durationMs)
    if (!inWorkingHours(start)) continue
    if (isBusy(t, t + durationMs)) continue
    suggestions.push({ start, end })
    if (suggestions.length >= maxSuggestions) break
  }
  return suggestions
}
