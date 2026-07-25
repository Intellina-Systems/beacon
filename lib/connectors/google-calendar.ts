import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  calendarAccounts,
  calendarEvents,
  calendars,
  type CalendarAccount,
  type InsertCalendarEvent,
} from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'
import { getValidAccessToken } from '@/lib/google/auth'
import { listCalendarEvents, type GoogleCalendarEvent } from '@/lib/google/calendar'
import type { SyncResult } from './types'

const WINDOW_PAST_DAYS = 7
const WINDOW_FUTURE_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

function eventStart(ev: GoogleCalendarEvent): Date | null {
  const raw = ev.start?.dateTime ?? ev.start?.date
  return raw ? new Date(raw) : null
}

function eventEnd(ev: GoogleCalendarEvent): Date | null {
  const raw = ev.end?.dateTime ?? ev.end?.date
  return raw ? new Date(raw) : null
}

// The dedicated, read-only "Google (imported)" calendar for a member, created
// lazily. Imported meetings materialize here so they render in the native grid.
async function ensureImportedCalendar(account: CalendarAccount): Promise<string> {
  const [existing] = await db
    .select({ id: calendars.id })
    .from(calendars)
    .where(
      and(
        eq(calendars.workspaceId, account.workspaceId),
        eq(calendars.ownerMemberId, account.memberId),
        eq(calendars.externalProvider, 'google'),
      ),
    )
    .limit(1)
  if (existing) return existing.id

  const [created] = await db
    .insert(calendars)
    .values({
      id: generateId(16),
      workspaceId: account.workspaceId,
      ownerMemberId: account.memberId,
      name: 'Google (imported)',
      color: '#16a34a',
      timezone: 'UTC',
      visibility: 'private',
      externalProvider: 'google',
    })
    .returning({ id: calendars.id })
  return created.id
}

// Map a Google event (already expanded to a single instance by singleEvents=true)
// to a native calendar_events insert. null = skip (cancelled or undated).
export function googleEventToInsert(
  ev: GoogleCalendarEvent,
  account: CalendarAccount,
  calendarId: string,
): InsertCalendarEvent | null {
  if (ev.status === 'cancelled') return null
  const start = eventStart(ev)
  const end = eventEnd(ev)
  if (!start || !end) return null
  const allDay = Boolean(ev.start?.date && !ev.start?.dateTime)

  return {
    id: generateId(16),
    workspaceId: account.workspaceId,
    calendarId,
    title: (ev.summary ?? '(No title)').slice(0, 500),
    startAt: start,
    endAt: end,
    startTimezone: 'UTC',
    endTimezone: 'UTC',
    allDay,
    status: 'confirmed',
    organizerMemberId: account.memberId,
    conferenceUrl: ev.hangoutLink ?? null,
    externalProvider: 'google',
    externalId: `gcal:${account.calendarId}:${ev.id}`,
  }
}

// Sync one calendar account: incremental when a syncToken exists, otherwise a
// full pull over the window. A 410 clears the token and retries fresh. Events
// are materialized into the member's read-only Google calendar; newly-seen
// meetings also emit a deduped event-store bridge event for Pulse/Timeline.
export async function syncCalendarAccount(account: CalendarAccount): Promise<SyncResult> {
  const accessToken = await getValidAccessToken(account)
  const now = Date.now()
  const useSync = Boolean(account.syncToken)

  const result = await listCalendarEvents(accessToken, account.calendarId, {
    syncToken: account.syncToken,
    timeMin: useSync ? undefined : new Date(now - WINDOW_PAST_DAYS * DAY_MS).toISOString(),
    timeMax: useSync ? undefined : new Date(now + WINDOW_FUTURE_DAYS * DAY_MS).toISOString(),
  })

  if (result.invalidSyncToken) {
    await db
      .update(calendarAccounts)
      .set({ syncToken: null, updatedAt: new Date() })
      .where(eq(calendarAccounts.id, account.id))
    return syncCalendarAccount({ ...account, syncToken: null })
  }

  const calendarId = await ensureImportedCalendar(account)
  const bridgeEvents: RawEvent[] = []
  let materialized = 0

  for (const ev of result.events) {
    const insert = googleEventToInsert(ev, account, calendarId)
    if (!insert) continue
    const written = await db
      .insert(calendarEvents)
      .values(insert)
      .onConflictDoUpdate({
        target: [calendarEvents.workspaceId, calendarEvents.externalProvider, calendarEvents.externalId],
        set: {
          title: insert.title,
          startAt: insert.startAt,
          endAt: insert.endAt,
          allDay: insert.allDay,
          conferenceUrl: insert.conferenceUrl,
          updatedAt: new Date(),
        },
      })
      .returning({ id: calendarEvents.id, createdAt: calendarEvents.createdAt, updatedAt: calendarEvents.updatedAt })
    materialized++

    // Bridge to the event store only the first time we import a meeting
    // (createdAt === updatedAt on a fresh insert). Stable externalId dedupes.
    const row = written[0]
    if (row && row.createdAt.getTime() === row.updatedAt.getTime()) {
      const isPast = insert.startAt.getTime() < now
      bridgeEvents.push({
        type: isPast ? 'meeting.held' : 'meeting.scheduled',
        source: 'calendar',
        externalId: `gcal-bridge:${account.calendarId}:${ev.id}`,
        engineer: account.externalEmail ?? 'calendar',
        summary: insert.title,
        occurredAt: insert.startAt,
        payload: { calendarEventId: row.id, googleEventId: ev.id, hangoutLink: ev.hangoutLink ?? null },
      })
    }
  }

  if (bridgeEvents.length > 0) {
    await ingestEvents(bridgeEvents, { workspaceId: account.workspaceId, defaultSource: 'calendar' })
  }

  await db
    .update(calendarAccounts)
    .set({
      syncToken: result.nextSyncToken ?? account.syncToken,
      lastSyncedAt: new Date(),
      lastSyncError: null,
      updatedAt: new Date(),
    })
    .where(eq(calendarAccounts.id, account.id))

  return { events: materialized, workItems: 0 }
}

export interface CalendarSyncSummary {
  synced: number
  failed: number
  events: number
}

// Sweep every enabled calendar account (or just one workspace's). Called from
// the hourly cron; failures are isolated per account and recorded, never thrown.
export async function syncAllCalendarAccounts(workspaceId?: string): Promise<CalendarSyncSummary> {
  const rows = await db
    .select()
    .from(calendarAccounts)
    .where(
      workspaceId
        ? and(eq(calendarAccounts.enabled, true), eq(calendarAccounts.workspaceId, workspaceId))
        : eq(calendarAccounts.enabled, true),
    )

  const summary: CalendarSyncSummary = { synced: 0, failed: 0, events: 0 }
  for (const account of rows) {
    try {
      const r = await syncCalendarAccount(account)
      summary.synced++
      summary.events += r.events
    } catch (error) {
      summary.failed++
      const message = error instanceof Error ? error.message : 'Sync failed'
      console.error('[calendar sync] account failed:', message)
      await db
        .update(calendarAccounts)
        .set({ lastSyncError: message, updatedAt: new Date() })
        .where(eq(calendarAccounts.id, account.id))
    }
  }
  return summary
}
