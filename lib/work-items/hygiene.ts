import 'server-only'

import { and, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { projects, workItems } from '@/lib/db/schema'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'

// Backlog/todo items with no activity past the threshold get cancelled —
// "let stale issues die" (the Linear Method's manageable-backlog principle).
// Active statuses (in_progress/in_review/blocked) are never auto-closed.
const AUTO_CLOSE_STATUSES = ['backlog', 'todo'] as const
// Resolved items get hidden from default views after their own, separate
// threshold — archiving never changes status, only visibility.
const AUTO_ARCHIVE_STATUSES = ['done', 'cancelled'] as const

export interface HygieneResult {
  closed: number
  archived: number
}

// Cron entry point. Both thresholds are opt-in per project (projects.autoCloseDays
// / autoArchiveDays); a project with neither set is left alone entirely.
export async function runHygiene(): Promise<HygieneResult> {
  const projectRows = await db
    .select({
      id: projects.id,
      workspaceId: projects.workspaceId,
      autoCloseDays: projects.autoCloseDays,
      autoArchiveDays: projects.autoArchiveDays,
    })
    .from(projects)
    .where(or(isNotNull(projects.autoCloseDays), isNotNull(projects.autoArchiveDays)))

  let closed = 0
  let archived = 0

  for (const project of projectRows) {
    if (project.autoCloseDays) {
      const cutoff = new Date(Date.now() - project.autoCloseDays * 24 * 60 * 60 * 1000)
      const staleItems = await db
        .select({ id: workItems.id, key: workItems.key, title: workItems.title })
        .from(workItems)
        .where(
          and(
            eq(workItems.projectId, project.id),
            inArray(workItems.status, [...AUTO_CLOSE_STATUSES]),
            lt(workItems.lastEventAt, cutoff),
            isNull(workItems.archivedAt),
          ),
        )

      const hygieneEvents: RawEvent[] = []
      for (const item of staleItems) {
        await db
          .update(workItems)
          .set({ status: 'cancelled', statusChangedAt: new Date(), updatedAt: new Date() })
          .where(eq(workItems.id, item.id))
        hygieneEvents.push({
          type: 'task.auto_closed',
          source: 'system',
          summary: `${item.key ?? item.title} auto-closed after ${project.autoCloseDays} days of inactivity`,
          task: item.id,
          externalId: `workitem:${item.id}:auto-closed`,
          payload: { reason: 'inactivity', thresholdDays: project.autoCloseDays },
        })
      }
      if (hygieneEvents.length > 0) {
        await ingestEvents(hygieneEvents, { workspaceId: project.workspaceId, defaultSource: 'system' })
        closed += hygieneEvents.length
      }
    }

    if (project.autoArchiveDays) {
      const cutoff = new Date(Date.now() - project.autoArchiveDays * 24 * 60 * 60 * 1000)
      const staleItems = await db
        .select({ id: workItems.id, key: workItems.key, title: workItems.title })
        .from(workItems)
        .where(
          and(
            eq(workItems.projectId, project.id),
            inArray(workItems.status, [...AUTO_ARCHIVE_STATUSES]),
            lt(workItems.lastEventAt, cutoff),
            isNull(workItems.archivedAt),
          ),
        )

      const hygieneEvents: RawEvent[] = []
      for (const item of staleItems) {
        await db
          .update(workItems)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(workItems.id, item.id))
        hygieneEvents.push({
          type: 'task.archived',
          source: 'system',
          summary: `${item.key ?? item.title} archived after ${project.autoArchiveDays} days`,
          task: item.id,
          externalId: `workitem:${item.id}:archived`,
          payload: { reason: 'inactivity', thresholdDays: project.autoArchiveDays },
        })
      }
      if (hygieneEvents.length > 0) {
        await ingestEvents(hygieneEvents, { workspaceId: project.workspaceId, defaultSource: 'system' })
        archived += hygieneEvents.length
      }
    }
  }

  return { closed, archived }
}
