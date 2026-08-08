import 'server-only'

import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { events, notifications } from '@/lib/db/schema'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'
import { generateId } from '@/lib/utils/id'

const QUIET_THRESHOLD_MS = 3 * 60 * 60 * 1000 // 3h with nothing new — long enough that a mid-turn lull can't trip it
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000 // don't bother scanning sessions older than this
const MIN_HOOK_EVENTS = 2 // proves the deterministic hooks were genuinely delivering, not a one-off blip

export interface StalenessCheckResult {
  flagged: number
}

// The exact bug this exists to catch: a coding-agent session that was
// reporting fine via the deterministic hook layer, then went completely
// silent mid-task — no agent.completed, no agent.session_ended, just nothing
// for hours. Model-authored events alone can't tell the difference between
// "the engineer stopped for the day" and "instrumentation broke," but a
// session that *was* emitting hook events (proof the mechanism worked) and
// then stopped without ever recording a clean end is specifically the
// silent-failure shape — the one that let the original bug run for a day
// and a half before anyone noticed.
export async function checkAgentStaleness(now: Date = new Date()): Promise<StalenessCheckResult> {
  const quietBefore = new Date(now.getTime() - QUIET_THRESHOLD_MS)
  const lookbackFloor = new Date(now.getTime() - LOOKBACK_MS)

  const sessions = await db
    .select({
      sessionId: events.sessionId,
      workspaceId: events.workspaceId,
      memberId: sql<string | null>`max(${events.memberId})`,
      lastEventAt: sql<Date>`max(${events.occurredAt})`,
      // agent.blocked counts as "cleanly ended" for staleness purposes even
      // though the task isn't done — a session that explicitly reported it's
      // waiting on a human has accurately communicated its state, and firing
      // a second "instrumentation might be dead" alert on top of that is a
      // false alarm, not new information.
      endedCleanly: sql<boolean>`bool_or(${events.type} in ('agent.completed', 'agent.session_ended', 'agent.blocked'))`,
    })
    .from(events)
    .where(and(isNotNull(events.sessionId), gte(events.occurredAt, lookbackFloor)))
    .groupBy(events.sessionId, events.workspaceId)
    .having(sql`count(*) filter (where ${events.instrumentation} = 'hook') >= ${MIN_HOOK_EVENTS}`)

  // `max(occurred_at)` comes back from postgres.js as a bare "YYYY-MM-DD
  // HH:MM:SS.ss" string (no offset) rather than a parsed Date, because it's a
  // computed aggregate column, not the underlying timestamp column itself —
  // postgres.js only auto-parses the latter. Every occurredAt in this table
  // is written as a UTC instant (see events.occurredAt everywhere else in
  // the codebase), so the fix is forcing that interpretation explicitly
  // rather than letting `new Date(...)` guess the local timezone.
  const stale = sessions.filter((s) => {
    if (s.endedCleanly || !s.sessionId) return false
    const lastEventAt = new Date(`${String(s.lastEventAt).replace(' ', 'T')}Z`)
    return lastEventAt < quietBefore
  })
  if (stale.length === 0) return { flagged: 0 }

  const eventsByWorkspace = new Map<string, RawEvent[]>()
  const candidates: { sessionId: string; workspaceId: string; memberId: string | null; externalId: string }[] = []

  for (const s of stale) {
    const sessionId = s.sessionId as string
    // Bucketed by day, not by run — re-flagging the same still-silent session
    // every single cron tick would be noise; once a day is enough to matter
    // without being ignorable. Reuses ingestEvents' own externalId dedup, the
    // same trick lib/plans/reminders.ts uses for its once-a-day nudge.
    // Belt-and-suspenders: this diagnostic event itself carries the session's
    // sessionId, so it becomes that session's new max(occurred_at) on the
    // next run — the session stops matching the staleness query at all until
    // it's been quiet for a fresh QUIET_THRESHOLD_MS *after* being flagged,
    // not just once a day. Confirmed via a live run: a session flagged once
    // came back flagged:0 on an immediate re-run, purely from this effect.
    const dayKey = now.toISOString().slice(0, 10)
    const externalId = `agent-stale:${sessionId}:${dayKey}`
    const list = eventsByWorkspace.get(s.workspaceId) ?? []
    list.push({
      type: 'agent.instrumentation_stale',
      source: 'system',
      summary: `Agent session went quiet — no events for over ${Math.round(QUIET_THRESHOLD_MS / 3_600_000)}h with no completion recorded`,
      sessionId,
      externalId,
      occurredAt: now,
    })
    eventsByWorkspace.set(s.workspaceId, list)
    candidates.push({ sessionId, workspaceId: s.workspaceId, memberId: s.memberId, externalId })
  }

  for (const [workspaceId, workspaceEvents] of eventsByWorkspace) {
    await ingestEvents(workspaceEvents, { workspaceId, defaultSource: 'system' })
  }

  // Resolve real event ids via externalId — ingestEvents' own return value
  // drops deduped rows, so this is the reliable way to zip back to the
  // member each one belongs to (same approach checkPlanReminders uses).
  // Scoped by type, same as checkPlanReminders scopes by 'plan.reminder' —
  // externalId is only unique per (workspaceId, source, externalId), not
  // globally, so an unscoped lookup could zip a notification to the wrong
  // workspace's event on a collision.
  const externalIds = candidates.map((c) => c.externalId)
  const insertedEvents = await db
    .select({ id: events.id, externalId: events.externalId })
    .from(events)
    .where(and(eq(events.type, 'agent.instrumentation_stale'), inArray(events.externalId, externalIds)))
  const eventIdByExternalId = new Map(insertedEvents.map((e) => [e.externalId, e.id]))

  // A session with no resolvable member (pure actorLabel, never matched to
  // the roster) still gets the diagnostic event above for dashboard
  // visibility — it just can't be routed to anyone's inbox.
  const notificationRows = candidates
    .filter((c) => c.memberId)
    .map((c) => {
      const eventId = eventIdByExternalId.get(c.externalId)
      return eventId
        ? { id: generateId(), workspaceId: c.workspaceId, memberId: c.memberId as string, eventId, workItemId: null }
        : null
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  if (notificationRows.length > 0) {
    await db
      .insert(notifications)
      .values(notificationRows)
      .onConflictDoNothing({ target: [notifications.memberId, notifications.eventId] })
  }

  return { flagged: candidates.length }
}
