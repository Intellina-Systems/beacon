import ICAL from 'ical.js'

// -----------------------------------------------------------------------------
// ICS (RFC 5545) import/export. Export is a hand-rolled VCALENDAR generator;
// import uses ical.js for robust parsing of real-world .ics files.
// -----------------------------------------------------------------------------

export interface IcsAttendee {
  email: string
  name?: string
  responseStatus?: 'needsAction' | 'accepted' | 'declined' | 'tentative'
}

export interface IcsEventInput {
  uid: string
  title: string
  description?: string | null
  location?: string | null
  start: Date
  end: Date
  allDay: boolean
  rrule?: string | null
  status?: 'confirmed' | 'tentative' | 'cancelled'
  attendees?: IcsAttendee[]
  organizerEmail?: string | null
  // EXDATE instants (cancelled occurrences) and modified-occurrence VEVENTs.
  exdates?: Date[]
  overrides?: { recurrenceId: Date; start: Date; end: Date; title?: string | null }[]
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function fmtUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

function escapeText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// Fold lines to 75 octets per RFC 5545, continuation lines start with a space.
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  if (rest.length) parts.push(` ${rest}`)
  return parts.join('\r\n')
}

const RESPONSE_TO_PARTSTAT: Record<string, string> = {
  needsAction: 'NEEDS-ACTION',
  accepted: 'ACCEPTED',
  declined: 'DECLINED',
  tentative: 'TENTATIVE',
}

function veventLines(ev: IcsEventInput, recurrenceId?: Date, startOverride?: Date, endOverride?: Date): string[] {
  const start = startOverride ?? ev.start
  const end = endOverride ?? ev.end
  const lines: string[] = ['BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${fmtUtc(new Date())}`]

  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(start)}`, `DTEND;VALUE=DATE:${fmtDate(end)}`)
  } else {
    lines.push(`DTSTART:${fmtUtc(start)}`, `DTEND:${fmtUtc(end)}`)
  }
  if (recurrenceId) lines.push(`RECURRENCE-ID:${fmtUtc(recurrenceId)}`)
  lines.push(`SUMMARY:${escapeText(ev.title)}`)
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`)
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`)
  if (ev.rrule && !recurrenceId) lines.push(`RRULE:${ev.rrule}`)
  if (ev.exdates?.length && !recurrenceId) {
    for (const ex of ev.exdates) lines.push(`EXDATE:${fmtUtc(ex)}`)
  }
  lines.push(`STATUS:${(ev.status ?? 'confirmed').toUpperCase()}`)
  if (ev.organizerEmail) lines.push(`ORGANIZER:mailto:${ev.organizerEmail}`)
  for (const a of ev.attendees ?? []) {
    const partstat = RESPONSE_TO_PARTSTAT[a.responseStatus ?? 'needsAction']
    const cn = a.name ? `;CN=${a.name}` : ''
    lines.push(`ATTENDEE${cn};PARTSTAT=${partstat}:mailto:${a.email}`)
  }
  lines.push('END:VEVENT')
  return lines
}

export function generateIcs(events: IcsEventInput[], calendarName = 'Beacon'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Beacon//Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]
  for (const ev of events) {
    lines.push(...veventLines(ev))
    for (const ovr of ev.overrides ?? []) {
      lines.push(...veventLines({ ...ev, title: ovr.title ?? ev.title }, ovr.recurrenceId, ovr.start, ovr.end))
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n')
}

export interface ParsedIcsEvent {
  uid: string | null
  title: string
  description: string | null
  location: string | null
  start: Date
  end: Date
  allDay: boolean
  rrule: string | null
  timezone: string
  status: 'confirmed' | 'tentative' | 'cancelled'
  attendees: IcsAttendee[]
}

const PARTSTAT_TO_RESPONSE: Record<string, IcsAttendee['responseStatus']> = {
  'NEEDS-ACTION': 'needsAction',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  TENTATIVE: 'tentative',
}

export function parseIcs(ics: string): ParsedIcsEvent[] {
  const jcal = ICAL.parse(ics)
  const comp = new ICAL.Component(jcal)
  const vevents = comp.getAllSubcomponents('vevent')
  const out: ParsedIcsEvent[] = []

  for (const ve of vevents) {
    // Skip modified-occurrence components on import; we ingest the master series.
    if (ve.getFirstPropertyValue('recurrence-id')) continue
    const event = new ICAL.Event(ve)
    const startTime = event.startDate
    const endTime = event.endDate
    if (!startTime || !endTime) continue

    const rruleProp = ve.getFirstProperty('rrule')
    const rrule = rruleProp ? String(rruleProp.getFirstValue()) : null
    const statusRaw = String(ve.getFirstPropertyValue('status') ?? 'CONFIRMED').toLowerCase()
    const status: ParsedIcsEvent['status'] =
      statusRaw === 'cancelled' || statusRaw === 'tentative' ? statusRaw : 'confirmed'

    const attendees: IcsAttendee[] = event.attendees.map((prop) => {
      const val = String(prop.getFirstValue() ?? '').replace(/^mailto:/i, '')
      const partstat = String(prop.getParameter('partstat') ?? 'NEEDS-ACTION')
      const cn = prop.getParameter('cn')
      return {
        email: val,
        name: cn ? String(cn) : undefined,
        responseStatus: PARTSTAT_TO_RESPONSE[partstat] ?? 'needsAction',
      }
    })

    out.push({
      uid: event.uid ?? null,
      title: event.summary ?? '(No title)',
      description: event.description ?? null,
      location: event.location ?? null,
      start: startTime.toJSDate(),
      end: endTime.toJSDate(),
      allDay: startTime.isDate,
      rrule,
      timezone: startTime.zone?.tzid ?? 'UTC',
      status,
      attendees,
    })
  }
  return out
}
