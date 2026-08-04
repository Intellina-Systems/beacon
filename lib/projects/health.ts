import 'server-only'

import { and, count, desc, eq, gte } from 'drizzle-orm'
import { generateObject } from 'ai'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { events, workItems, type Project, type ProjectHealth } from '@/lib/db/schema'

// Default cadence: a project without a posted update in this many days shows
// as needing one. No per-project override yet (see SYNTHESIS.md Phase 3 —
// configurable reminder cadence is a later candidate).
export const STALE_UPDATE_DAYS = 7

export function isUpdateStale(lastUpdateAt: Date | null, at: Date = new Date()): boolean {
  if (!lastUpdateAt) return true
  return at.getTime() - lastUpdateAt.getTime() > STALE_UPDATE_DAYS * 24 * 60 * 60 * 1000
}

export interface ProjectActivitySummary {
  statusCounts: Record<string, number>
  recentEvents: { type: string; summary: string; occurredAt: Date }[]
  totalItems: number
}

export async function gatherProjectActivity(
  workspaceId: string,
  projectId: string,
  sinceDays = 7,
): Promise<ProjectActivitySummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)

  const [statusRows, recentEvents] = await Promise.all([
    db
      .select({ status: workItems.status, count: count() })
      .from(workItems)
      .where(and(eq(workItems.workspaceId, workspaceId), eq(workItems.projectId, projectId)))
      .groupBy(workItems.status),
    db
      .select({ type: events.type, summary: events.summary, occurredAt: events.occurredAt })
      .from(events)
      .innerJoin(workItems, eq(workItems.id, events.workItemId))
      .where(
        and(eq(events.workspaceId, workspaceId), eq(workItems.projectId, projectId), gte(events.occurredAt, since)),
      )
      .orderBy(desc(events.occurredAt))
      .limit(50),
  ])

  const statusCounts: Record<string, number> = {}
  let totalItems = 0
  for (const row of statusRows) {
    statusCounts[row.status] = row.count
    totalItems += row.count
  }

  return { statusCounts, recentEvents, totalItems }
}

const draftSchema = z.object({
  health: z.enum(['on_track', 'at_risk', 'off_track']),
  body: z.string().describe('2-4 sentences: what shipped, what changed, what to watch — plain prose, no headers'),
})

export interface DraftedUpdate {
  health: ProjectHealth
  body: string
}

// Drafts a project update from the last 7 days of activity — the AI has the
// same event-stream context the chat tool already has, just scoped to one
// project. The admin/manager reviews and edits before posting; this never
// posts on its own.
export async function draftProjectUpdate(workspaceId: string, project: Project): Promise<DraftedUpdate> {
  const activity = await gatherProjectActivity(workspaceId, project.id)

  const statusLines = Object.entries(activity.statusCounts)
    .map(([status, n]) => `${status}: ${n}`)
    .join(', ')
  const eventLines = activity.recentEvents
    .slice(0, 25)
    .map((e) => `- [${e.type}] ${e.summary}`)
    .join('\n')

  const { object } = await generateObject({
    model: 'openai/gpt-5.4-nano',
    schema: draftSchema,
    system:
      'You write short, honest project status updates for an engineering team from raw event-log data. ' +
      'Never invent activity that is not in the data. If there is little or no recent activity, say so plainly and consider that a signal for at_risk.',
    prompt: [
      `Project: ${project.name}`,
      `Work item status breakdown (${activity.totalItems} total): ${statusLines || 'no work items yet'}`,
      '',
      'Events in the last 7 days (newest first):',
      eventLines || '(none)',
      '',
      'Draft a health assessment and a short update body.',
    ].join('\n'),
  })

  return object
}
