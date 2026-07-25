import 'server-only'

// Minimal shape of a Google Calendar event — only the fields Beacon reads.
export interface GoogleCalendarEvent {
  id: string
  status?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { email?: string; responseStatus?: string; self?: boolean }[]
  organizer?: { email?: string; self?: boolean }
  hangoutLink?: string
  htmlLink?: string
}

export interface ListEventsResult {
  events: GoogleCalendarEvent[]
  nextSyncToken: string | null
  // A stale syncToken returns 410 Gone — the caller must clear it and full-resync.
  invalidSyncToken: boolean
}

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars'

// List events. With a syncToken it's incremental (only changes since last sync);
// without one it's a full pull over [timeMin, timeMax]. singleEvents=true is kept
// constant across both so recurring events expand consistently and the syncToken
// stays valid. Follows nextPageToken to completion; nextSyncToken lands on the
// final page.
export async function listCalendarEvents(
  accessToken: string,
  calendarId: string,
  opts: { syncToken?: string | null; timeMin?: string; timeMax?: string },
): Promise<ListEventsResult> {
  const events: GoogleCalendarEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | null = null

  do {
    const params = new URLSearchParams({ singleEvents: 'true', maxResults: '250' })
    if (opts.syncToken) {
      params.set('syncToken', opts.syncToken)
    } else {
      // timeMin/timeMax and syncToken are mutually exclusive per the API.
      if (opts.timeMin) params.set('timeMin', opts.timeMin)
      if (opts.timeMax) params.set('timeMax', opts.timeMax)
    }
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetch(`${CALENDAR_API}/${encodeURIComponent(calendarId)}/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (res.status === 410) {
      return { events: [], nextSyncToken: null, invalidSyncToken: true }
    }
    if (!res.ok) {
      throw new Error(`Google Calendar API ${res.status}`)
    }

    const data = (await res.json()) as {
      items?: GoogleCalendarEvent[]
      nextPageToken?: string
      nextSyncToken?: string
    }
    if (data.items) events.push(...data.items)
    pageToken = data.nextPageToken
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken
  } while (pageToken)

  return { events, nextSyncToken, invalidSyncToken: false }
}

// The signed-in Google user's email — used to label the calendar account and to
// map meetings back to a Beacon member (resolveMember matches on email).
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { email?: string }
  return data.email ?? null
}
