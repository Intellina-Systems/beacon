import 'server-only'

import { and, eq, gte, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  events,
  insights,
  projects,
  workItems,
  workspaces,
  type InsightKind,
  type WorkItemStatus,
} from '@/lib/db/schema'
import { getActiveBlockers, getPulse } from '@/lib/events/queries'
import { generateId } from '@/lib/utils/id'

const BLOCKER_WARNING_DAYS = 3
const BLOCKER_CRITICAL_DAYS = 7
const STALE_PROJECT_DAYS = 14
const DIGEST_INTERVAL_DAYS = 7
const OPEN_STATUSES: WorkItemStatus[] = ['triage', 'backlog', 'todo', 'in_progress', 'in_review', 'blocked']

interface InsightFields {
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  memberId?: string | null
  sourceEventIds?: string[]
  periodStart?: Date
  periodEnd?: Date
}

// One active insight per (workspace, kind, scope) — scope is a work item for
// blocker insights, a project for risk insights. Re-running the generator
// updates the existing row (fresher severity/detail) instead of piling up
// duplicates every cron tick.
async function upsertActiveInsight(
  workspaceId: string,
  kind: InsightKind,
  scope: { workItemId?: string | null; projectId?: string | null },
  fields: InsightFields,
): Promise<void> {
  const scopeCondition = scope.workItemId
    ? eq(insights.workItemId, scope.workItemId)
    : scope.projectId
      ? eq(insights.projectId, scope.projectId)
      : isNull(insights.workItemId)

  const [existing] = await db
    .select({ id: insights.id })
    .from(insights)
    .where(
      and(
        eq(insights.workspaceId, workspaceId),
        eq(insights.kind, kind),
        eq(insights.status, 'active'),
        scopeCondition,
      ),
    )
    .limit(1)

  if (existing) {
    await db
      .update(insights)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(insights.id, existing.id))
  } else {
    await db.insert(insights).values({
      id: generateId(),
      workspaceId,
      kind,
      workItemId: scope.workItemId ?? null,
      projectId: scope.projectId ?? null,
      status: 'active',
      ...fields,
    })
  }
}

export async function generateBlockerInsights(workspaceId: string): Promise<number> {
  const blockers = await getActiveBlockers(workspaceId, 30, null)
  const blockedWorkItemIds = new Set<string>()
  let count = 0

  for (const blocker of blockers) {
    if (!blocker.workItem) continue
    blockedWorkItemIds.add(blocker.workItem.id)
    const ageDays = (Date.now() - blocker.event.occurredAt.getTime()) / (24 * 60 * 60 * 1000)
    if (ageDays < BLOCKER_WARNING_DAYS) continue

    await upsertActiveInsight(
      workspaceId,
      'blocker',
      { workItemId: blocker.workItem.id },
      {
        severity: ageDays >= BLOCKER_CRITICAL_DAYS ? 'critical' : 'warning',
        title: `${blocker.workItem.key ?? blocker.workItem.title} has been blocked for ${Math.floor(ageDays)} days`,
        detail: blocker.event.summary,
        memberId: blocker.member?.id ?? null,
        sourceEventIds: [blocker.event.id],
      },
    )
    count++
  }

  // Resolve blocker insights for items that are no longer blocked
  const activeBlockerInsights = await db
    .select({ id: insights.id, workItemId: insights.workItemId })
    .from(insights)
    .where(and(eq(insights.workspaceId, workspaceId), eq(insights.kind, 'blocker'), eq(insights.status, 'active')))
  for (const row of activeBlockerInsights) {
    if (row.workItemId && !blockedWorkItemIds.has(row.workItemId)) {
      await db.update(insights).set({ status: 'resolved', updatedAt: new Date() }).where(eq(insights.id, row.id))
    }
  }

  return count
}

export async function generateStaleProjectInsights(workspaceId: string): Promise<number> {
  const since = new Date(Date.now() - STALE_PROJECT_DAYS * 24 * 60 * 60 * 1000)
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.status, 'active')))

  let count = 0
  const activeProjectIds = new Set<string>()

  for (const project of projectRows) {
    const [recentEvent] = await db
      .select({ id: events.id })
      .from(events)
      .innerJoin(workItems, eq(workItems.id, events.workItemId))
      .where(and(eq(workItems.projectId, project.id), gte(events.occurredAt, since)))
      .limit(1)
    if (recentEvent) {
      activeProjectIds.add(project.id)
      continue
    }

    const [openItem] = await db
      .select({ id: workItems.id })
      .from(workItems)
      .where(and(eq(workItems.projectId, project.id), inArray(workItems.status, OPEN_STATUSES)))
      .limit(1)
    if (!openItem) continue // no open work, nothing to be "stale" about

    await upsertActiveInsight(
      workspaceId,
      'risk',
      { projectId: project.id },
      {
        severity: 'warning',
        title: `${project.name} has had no activity in ${STALE_PROJECT_DAYS} days`,
        detail: 'No events recorded for this project recently, but it still has open work items.',
      },
    )
    count++
  }

  const activeRiskInsights = await db
    .select({ id: insights.id, projectId: insights.projectId })
    .from(insights)
    .where(and(eq(insights.workspaceId, workspaceId), eq(insights.kind, 'risk'), eq(insights.status, 'active')))
  for (const row of activeRiskInsights) {
    if (row.projectId && activeProjectIds.has(row.projectId)) {
      await db.update(insights).set({ status: 'resolved', updatedAt: new Date() }).where(eq(insights.id, row.id))
    }
  }

  return count
}

// One digest per rolling week — a deterministic pulse rollup (not another AI
// call; the AI drafting budget in this phase goes to project updates, where
// human review is expected before anything is posted).
export async function generateWeeklyDigest(workspaceId: string): Promise<boolean> {
  const since = new Date(Date.now() - DIGEST_INTERVAL_DAYS * 24 * 60 * 60 * 1000)
  const [recentDigest] = await db
    .select({ id: insights.id })
    .from(insights)
    .where(and(eq(insights.workspaceId, workspaceId), eq(insights.kind, 'digest'), gte(insights.createdAt, since)))
    .limit(1)
  if (recentDigest) return false

  const pulse = await getPulse(workspaceId, DIGEST_INTERVAL_DAYS)
  if (pulse.totalEvents === 0) return false

  const periodEnd = new Date()
  const periodStart = since
  await db.insert(insights).values({
    id: generateId(),
    workspaceId,
    kind: 'digest',
    severity: 'info',
    title: `Weekly digest — ${pulse.totalEvents} events`,
    detail: `${pulse.prsMerged} PRs merged, ${pulse.ciFailures} CI failures, ${pulse.activeMemberIds.length} active engineers. Work: ${pulse.byCategory.work}, code: ${pulse.byCategory.code}, CI/CD: ${pulse.byCategory.cicd}, agents: ${pulse.byCategory.agent}.`,
    status: 'active',
    periodStart,
    periodEnd,
  })
  return true
}

export interface InsightGenerationResult {
  blockers: number
  staleProjects: number
  digests: number
}

// Cron entry point — runs the three generators across every workspace.
export async function generateInsights(): Promise<InsightGenerationResult> {
  const workspaceRows = await db.select({ id: workspaces.id }).from(workspaces)

  let blockers = 0
  let staleProjects = 0
  let digests = 0

  for (const workspace of workspaceRows) {
    blockers += await generateBlockerInsights(workspace.id)
    staleProjects += await generateStaleProjectInsights(workspace.id)
    if (await generateWeeklyDigest(workspace.id)) digests++
  }

  return { blockers, staleProjects, digests }
}
