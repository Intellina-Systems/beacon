import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { events, members, notifications } from '@/lib/db/schema'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'
import { generateId } from '@/lib/utils/id'
import { getMemberPlan, serverDateKey } from './queries'

// Local "morning" target hour for the nudge. Not configurable per-workspace
// yet — a reasonable single default, same spirit as the due-date window in
// lib/work-items/due-dates.ts.
const REMINDER_HOUR = 9

export interface PlanReminderResult {
  sent: number
}

function localHour(date: Date, timezone: string): number {
  try {
    return (
      Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(date)) % 24
    )
  } catch {
    return date.getUTCHours()
  }
}

function localDateKey(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return serverDateKey(date)
  }
}

// Cron entry point (hourly, via /api/cron/intelligence): for every active,
// non-admin member whose local clock currently reads REMINDER_HOUR, if they
// haven't filed today's plan and haven't already been reminded today, fires
// one plan.reminder event plus a notification pointing directly at it — no
// work item involved, so this bypasses ingestEvents' watcher-based fan-out
// (lib/events/ingest.ts fanOutNotifications) in favor of the same
// null-workItemId shape the automation engine's `notify` action already
// produces (lib/events/ingest.ts runAutomationRules). Admins are skipped —
// they don't file plans (see DailyPlanCard's !isAdmin gate on Pulse).
export async function checkPlanReminders(): Promise<PlanReminderResult> {
  const now = new Date()
  const roster = await db
    .select({
      id: members.id,
      workspaceId: members.workspaceId,
      name: members.name,
      timezone: members.timezone,
      accessRole: members.accessRole,
    })
    .from(members)
    .where(eq(members.status, 'active'))

  const eventsByWorkspace = new Map<string, RawEvent[]>()
  const dueMembers: { id: string; workspaceId: string; externalId: string }[] = []

  for (const member of roster) {
    if (member.accessRole === 'admin') continue

    const timezone = member.timezone ?? 'UTC'
    if (localHour(now, timezone) !== REMINDER_HOUR) continue

    const dateKey = localDateKey(now, timezone)
    const plan = await getMemberPlan(member.id, dateKey)
    if (plan) continue

    const externalId = `plan-reminder:${member.id}:${dateKey}`
    const list = eventsByWorkspace.get(member.workspaceId) ?? []
    list.push({
      type: 'plan.reminder',
      source: 'system',
      summary: `Reminder: write today's plan`,
      engineer: member.name,
      externalId,
      occurredAt: now,
    })
    eventsByWorkspace.set(member.workspaceId, list)
    dueMembers.push({ id: member.id, workspaceId: member.workspaceId, externalId })
  }

  if (dueMembers.length === 0) return { sent: 0 }

  for (const [workspaceId, workspaceEvents] of eventsByWorkspace) {
    await ingestEvents(workspaceEvents, { workspaceId, defaultSource: 'system' })
  }

  // Resolve real event ids via externalId rather than trusting ingestEvents'
  // insertedRows order, which drops deduped entries and can't be zipped back
  // to the input array by index.
  const externalIds = dueMembers.map((m) => m.externalId)
  const insertedEvents = await db
    .select({ id: events.id, externalId: events.externalId })
    .from(events)
    .where(and(eq(events.type, 'plan.reminder'), inArray(events.externalId, externalIds)))
  const eventIdByExternalId = new Map(insertedEvents.map((e) => [e.externalId, e.id]))

  const notificationRows = dueMembers
    .map((m) => {
      const eventId = eventIdByExternalId.get(m.externalId)
      return eventId
        ? { id: generateId(), workspaceId: m.workspaceId, memberId: m.id, eventId, workItemId: null }
        : null
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  if (notificationRows.length > 0) {
    await db
      .insert(notifications)
      .values(notificationRows)
      .onConflictDoNothing({ target: [notifications.memberId, notifications.eventId] })
  }

  return { sent: notificationRows.length }
}
