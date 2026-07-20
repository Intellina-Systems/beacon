import 'server-only'

import { and, gte, isNotNull, lt, lte, notInArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { workItems } from '@/lib/db/schema'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'

const DUE_SOON_WINDOW_DAYS = 2

export interface DueDateCheckResult {
  dueSoon: number
  overdue: number
}

// Cron entry point: emits task.due_soon / task.overdue as ordinary events —
// each fires once per item (idempotent externalId), so this is safe to run
// as often as the cron does without re-notifying every hour. These events
// exist to be automation triggers as much as they exist for the timeline —
// "notify the lead when something goes overdue" is just a rule away.
export async function checkDueDates(): Promise<DueDateCheckResult> {
  const now = new Date()
  const soonCutoff = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const [dueSoonItems, overdueItems] = await Promise.all([
    db
      .select({
        id: workItems.id,
        key: workItems.key,
        title: workItems.title,
        workspaceId: workItems.workspaceId,
        dueDate: workItems.dueDate,
      })
      .from(workItems)
      .where(
        and(
          isNotNull(workItems.dueDate),
          gte(workItems.dueDate, now),
          lte(workItems.dueDate, soonCutoff),
          notInArray(workItems.status, ['done', 'cancelled']),
        ),
      ),
    db
      .select({
        id: workItems.id,
        key: workItems.key,
        title: workItems.title,
        workspaceId: workItems.workspaceId,
        dueDate: workItems.dueDate,
      })
      .from(workItems)
      .where(
        and(
          isNotNull(workItems.dueDate),
          lt(workItems.dueDate, now),
          notInArray(workItems.status, ['done', 'cancelled']),
        ),
      ),
  ])

  const byWorkspace = new Map<string, RawEvent[]>()
  function push(workspaceId: string, event: RawEvent) {
    const list = byWorkspace.get(workspaceId) ?? []
    list.push(event)
    byWorkspace.set(workspaceId, list)
  }

  for (const item of dueSoonItems) {
    push(item.workspaceId, {
      type: 'task.due_soon',
      source: 'system',
      summary: `${item.key ?? item.title} is due soon`,
      task: item.id,
      externalId: `workitem:${item.id}:due-soon`,
      payload: { dueDate: item.dueDate?.toISOString() },
    })
  }
  for (const item of overdueItems) {
    push(item.workspaceId, {
      type: 'task.overdue',
      source: 'system',
      summary: `${item.key ?? item.title} is overdue`,
      task: item.id,
      externalId: `workitem:${item.id}:overdue`,
      payload: { dueDate: item.dueDate?.toISOString() },
    })
  }

  for (const [workspaceId, workspaceEvents] of byWorkspace) {
    await ingestEvents(workspaceEvents, { workspaceId, defaultSource: 'system' })
  }

  return { dueSoon: dueSoonItems.length, overdue: overdueItems.length }
}
