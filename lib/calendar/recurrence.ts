import { RRule } from 'rrule'
import { DateTime } from 'luxon'
import type { CalendarEvent, CalendarEventOverride } from '@/lib/db/schema'

// -----------------------------------------------------------------------------
// Recurrence expansion, RFC 5545 style, with correct wall-clock behaviour across
// DST. rrule.js is timezone-naive: it treats a Date's UTC fields as the local
// wall clock. So we (a) convert the stored UTC instant → the event's local
// wall-clock components packed into a UTC "floating" Date for rrule, expand,
// then (b) convert each floating occurrence's wall-clock back to a real instant
// in the event's zone via luxon. A weekly 09:00 meeting therefore stays 09:00
// local even when the UTC offset shifts across a DST boundary.
// -----------------------------------------------------------------------------

// Expand a few days past the query window so occurrences nudged by a timezone
// offset or a small override move aren't dropped at the edges.
const EDGE_PAD_MS = 3 * 24 * 60 * 60 * 1000
const MAX_OCCURRENCES = 2000

function toFloating(instant: Date, zone: string): Date {
  const dt = DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(zone)
  return new Date(Date.UTC(dt.year, dt.month - 1, dt.day, dt.hour, dt.minute, dt.second))
}

function fromFloating(floating: Date, zone: string): Date {
  return DateTime.fromObject(
    {
      year: floating.getUTCFullYear(),
      month: floating.getUTCMonth() + 1,
      day: floating.getUTCDate(),
      hour: floating.getUTCHours(),
      minute: floating.getUTCMinutes(),
      second: floating.getUTCSeconds(),
    },
    { zone },
  ).toJSDate()
}

export interface EventOccurrence {
  // Stable per-occurrence id: masterId for singles, masterId::ISO for instances.
  instanceId: string
  masterId: string
  calendarId: string
  title: string
  description: string | null
  location: string | null
  color: string | null
  start: Date
  end: Date
  allDay: boolean
  status: CalendarEvent['status']
  transparency: CalendarEvent['transparency']
  visibility: CalendarEvent['visibility']
  organizerMemberId: string | null
  conferenceUrl: string | null
  isRecurring: boolean
  // The unmodified start of this occurrence (RECURRENCE-ID); null for singles.
  originalStart: Date | null
  externalProvider: string | null
  readOnly: boolean
}

function baseOccurrence(master: CalendarEvent, start: Date, end: Date, originalStart: Date | null): EventOccurrence {
  return {
    instanceId: originalStart ? `${master.id}::${originalStart.toISOString()}` : master.id,
    masterId: master.id,
    calendarId: master.calendarId,
    title: master.title,
    description: master.description,
    location: master.location,
    color: master.color,
    start,
    end,
    allDay: master.allDay,
    status: master.status,
    transparency: master.transparency,
    visibility: master.visibility,
    organizerMemberId: master.organizerMemberId,
    conferenceUrl: master.conferenceUrl,
    isRecurring: Boolean(master.rrule),
    originalStart,
    externalProvider: master.externalProvider,
    readOnly: Boolean(master.externalProvider),
  }
}

// Build the rrule with a floating dtstart derived from the master's real start.
function buildRule(master: CalendarEvent): RRule {
  const options = RRule.parseString(master.rrule as string)
  options.dtstart = toFloating(master.startAt, master.startTimezone)
  return new RRule(options)
}

// Raw occurrence start instants for a recurring master within [from, to].
export function occurrenceStarts(master: CalendarEvent, from: Date, to: Date): Date[] {
  if (!master.rrule) return [master.startAt]
  const zone = master.startTimezone
  const rule = buildRule(master)
  const floatFrom = toFloating(new Date(from.getTime() - EDGE_PAD_MS), zone)
  const floatTo = toFloating(new Date(to.getTime() + EDGE_PAD_MS), zone)
  return rule
    .between(floatFrom, floatTo, true)
    .slice(0, MAX_OCCURRENCES)
    .map((f) => fromFloating(f, zone))
}

// Expand a set of masters (+ their overrides) into concrete occurrences that
// overlap [rangeStart, rangeEnd]. Overrides are keyed by masterId → (recurrence
// instant ISO → override row).
export function expandEvents(
  masters: CalendarEvent[],
  overridesByMaster: Map<string, Map<string, CalendarEventOverride>>,
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  const out: EventOccurrence[] = []

  for (const master of masters) {
    const durationMs = master.endAt.getTime() - master.startAt.getTime()
    const overrides = overridesByMaster.get(master.id)

    if (!master.rrule) {
      if (master.startAt < rangeEnd && master.endAt > rangeStart && master.status !== 'cancelled') {
        out.push(baseOccurrence(master, master.startAt, master.endAt, null))
      }
      continue
    }

    for (const originalStart of occurrenceStarts(master, rangeStart, rangeEnd)) {
      const override = overrides?.get(originalStart.toISOString())
      if (override?.cancelled) continue

      let start = originalStart
      let end = new Date(originalStart.getTime() + durationMs)
      let occ = baseOccurrence(master, start, end, originalStart)

      if (override) {
        if (override.startAt) start = override.startAt
        if (override.endAt) end = override.endAt
        else if (override.startAt) end = new Date(override.startAt.getTime() + durationMs)
        occ = {
          ...occ,
          start,
          end,
          title: override.title ?? occ.title,
          description: override.description ?? occ.description,
          location: override.location ?? occ.location,
          allDay: override.allDay ?? occ.allDay,
          status: override.status ?? occ.status,
        }
      }

      if (occ.status === 'cancelled') continue
      if (start < rangeEnd && end > rangeStart) out.push(occ)
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime())
}

// Compute the last instant a rule can produce (for the cached recurrenceEndAt
// range-pruning column). Null = unbounded (no UNTIL/COUNT).
export function computeRecurrenceEnd(
  master: Pick<CalendarEvent, 'rrule' | 'startAt' | 'startTimezone' | 'endAt'>,
): Date | null {
  if (!master.rrule) return null
  const options = RRule.parseString(master.rrule)
  if (!options.until && !options.count) return null
  const zone = master.startTimezone
  const rule = new RRule({ ...options, dtstart: toFloating(master.startAt, zone) })
  const all = rule.all((_, i) => i < MAX_OCCURRENCES)
  const last = all[all.length - 1]
  if (!last) return null
  const lastStart = fromFloating(last, zone)
  const durationMs = master.endAt.getTime() - master.startAt.getTime()
  return new Date(lastStart.getTime() + durationMs)
}

// Serialize an UNTIL for "this and following" splits, in the floating-wall-clock
// convention used above (so it compares correctly during expansion). Returns the
// RRULE-ready UNTIL token, e.g. "20260731T090000Z".
export function floatingUntil(instant: Date, zone: string): string {
  const f = toFloating(instant, zone)
  return f
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}
