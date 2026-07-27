import { and, count, desc, eq, gte, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { events, members, workItems, type Event, type Member, type WorkItem } from '@/lib/db/schema'
import { BLOCKING_EVENT_TYPES, UNBLOCKING_EVENT_TYPES, categorizeEventType, type EventCategory } from './taxonomy'

export interface EventFilters {
  sinceDays?: number
  source?: Event['source']
  memberId?: string
  workItemId?: string
  types?: string[]
  limit?: number
  offset?: number
  // Role-based visibility: restrict to these members' activity (unattributed
  // events stay visible — they're workspace-wide signals like CI). `null` or
  // undefined means unrestricted (admin/manager).
  visibleMemberIds?: string[] | null
}

function visibilityCondition(visibleMemberIds: string[] | null | undefined): SQL | undefined {
  if (!visibleMemberIds) return undefined
  if (visibleMemberIds.length === 0) return isNull(events.memberId)
  return or(inArray(events.memberId, visibleMemberIds), isNull(events.memberId))
}

function eventConditions(workspaceId: string, filters: EventFilters): (SQL | undefined)[] {
  const conditions: (SQL | undefined)[] = [eq(events.workspaceId, workspaceId)]
  if (filters.sinceDays) {
    const since = new Date(Date.now() - filters.sinceDays * 24 * 60 * 60 * 1000)
    conditions.push(gte(events.occurredAt, since))
  }
  if (filters.source) conditions.push(eq(events.source, filters.source))
  if (filters.memberId) conditions.push(eq(events.memberId, filters.memberId))
  if (filters.workItemId) conditions.push(eq(events.workItemId, filters.workItemId))
  if (filters.types?.length) conditions.push(inArray(events.type, filters.types))
  conditions.push(visibilityCondition(filters.visibleMemberIds))
  return conditions
}

export async function countEvents(workspaceId: string, filters: EventFilters = {}): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(events)
    .where(and(...eventConditions(workspaceId, filters)))
  return row?.value ?? 0
}

// Per-source counts for the timeline filter bar — ignores `filters.source` so
// every pill can show its own total regardless of which one is selected.
export async function countEventsBySource(
  workspaceId: string,
  filters: Omit<EventFilters, 'source'> = {},
): Promise<{ source: Event['source']; count: number }[]> {
  return db
    .select({ source: events.source, count: count() })
    .from(events)
    .where(and(...eventConditions(workspaceId, filters)))
    .groupBy(events.source)
}

export async function listEvents(workspaceId: string, filters: EventFilters = {}) {
  const conditions = eventConditions(workspaceId, filters)

  return db
    .select({
      id: events.id,
      source: events.source,
      type: events.type,
      summary: events.summary,
      actorLabel: events.actorLabel,
      memberId: events.memberId,
      memberName: members.name,
      workItemId: events.workItemId,
      workItemTitle: workItems.title,
      workItemKey: workItems.key,
      payload: events.payload,
      confidence: events.confidence,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .leftJoin(members, eq(members.id, events.memberId))
    .leftJoin(workItems, eq(workItems.id, events.workItemId))
    .where(and(...conditions))
    .orderBy(desc(events.occurredAt))
    .limit(Math.min(filters.limit ?? 100, 500))
    .offset(filters.offset ?? 0)
}

export type EventRow = Awaited<ReturnType<typeof listEvents>>[number]

export interface Pulse {
  totalEvents: number
  byCategory: Record<EventCategory | 'other', number>
  byType: { type: string; count: number }[]
  activeMemberIds: string[]
  prsMerged: number
  ciFailures: number
  sinceDays: number
}

// Aggregate view of what happened in the last N days — the dashboard backbone.
export async function getPulse(workspaceId: string, sinceDays = 7, visibleMemberIds?: string[] | null): Promise<Pulse> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)

  const typeRows = await db
    .select({ type: events.type, count: count() })
    .from(events)
    .where(
      and(eq(events.workspaceId, workspaceId), gte(events.occurredAt, since), visibilityCondition(visibleMemberIds)),
    )
    .groupBy(events.type)

  const memberRows = await db
    .selectDistinct({ memberId: events.memberId })
    .from(events)
    .where(
      and(
        eq(events.workspaceId, workspaceId),
        gte(events.occurredAt, since),
        isNotNull(events.memberId),
        visibilityCondition(visibleMemberIds),
      ),
    )

  const byCategory: Pulse['byCategory'] = { work: 0, code: 0, cicd: 0, agent: 0, comms: 0, knowledge: 0, other: 0 }
  let totalEvents = 0
  let prsMerged = 0
  let ciFailures = 0
  for (const row of typeRows) {
    totalEvents += row.count
    byCategory[categorizeEventType(row.type)] += row.count
    if (row.type === 'pr.merged') prsMerged = row.count
    if (row.type === 'ci.failed') ciFailures += row.count
  }

  return {
    totalEvents,
    byCategory,
    byType: typeRows.sort((a, b) => b.count - a.count),
    activeMemberIds: memberRows.map((row) => row.memberId).filter((id): id is string => !!id),
    prsMerged,
    ciFailures,
    sinceDays,
  }
}

export interface Blocker {
  event: EventRow
  workItem: Pick<WorkItem, 'id' | 'key' | 'title' | 'status'> | null
  member: Pick<Member, 'id' | 'name'> | null
}

// A blocker is a blocking event (task.blocked, agent.blocked, ci.failed…) with
// no later unblocking event in the same scope (work item, or actor if unlinked),
// plus any work item sitting in "blocked" status.
export async function getActiveBlockers(
  workspaceId: string,
  sinceDays = 14,
  visibleMemberIds?: string[] | null,
): Promise<Blocker[]> {
  const rows = await listEvents(workspaceId, {
    sinceDays,
    types: [...BLOCKING_EVENT_TYPES, ...UNBLOCKING_EVENT_TYPES],
    limit: 500,
    visibleMemberIds,
  })

  // rows are newest-first; walk oldest-first tracking blocked scopes
  const blockedByScope = new Map<string, EventRow>()
  for (const row of [...rows].reverse()) {
    const scope = row.workItemId ?? `actor:${row.memberId ?? row.actorLabel ?? 'unknown'}`
    if (BLOCKING_EVENT_TYPES.has(row.type)) blockedByScope.set(scope, row)
    else if (UNBLOCKING_EVENT_TYPES.has(row.type)) blockedByScope.delete(scope)
  }

  const blockers: Blocker[] = Array.from(blockedByScope.values()).map((event) => ({
    event,
    workItem: event.workItemId
      ? { id: event.workItemId, key: event.workItemKey, title: event.workItemTitle ?? '', status: 'blocked' }
      : null,
    member: event.memberId ? { id: event.memberId, name: event.memberName ?? event.actorLabel ?? '' } : null,
  }))

  // Include work items explicitly in blocked status that we didn't already catch
  const coveredWorkItemIds = new Set(blockers.map((blocker) => blocker.workItem?.id).filter(Boolean))
  const blockedItems = await db
    .select({
      id: workItems.id,
      key: workItems.key,
      title: workItems.title,
      status: workItems.status,
      assigneeMemberId: workItems.assigneeMemberId,
      assigneeName: members.name,
      statusChangedAt: workItems.statusChangedAt,
    })
    .from(workItems)
    .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
    .where(
      and(
        eq(workItems.workspaceId, workspaceId),
        eq(workItems.status, 'blocked'),
        visibleMemberIds
          ? or(inArray(workItems.assigneeMemberId, visibleMemberIds), isNull(workItems.assigneeMemberId))
          : undefined,
      ),
    )

  for (const item of blockedItems) {
    if (coveredWorkItemIds.has(item.id)) continue
    blockers.push({
      event: {
        id: `workitem:${item.id}`,
        source: 'system',
        type: 'task.blocked',
        summary: `${item.key ?? item.title} is in blocked status`,
        actorLabel: item.assigneeName,
        memberId: item.assigneeMemberId,
        memberName: item.assigneeName,
        workItemId: item.id,
        workItemTitle: item.title,
        workItemKey: item.key,
        payload: null,
        confidence: null,
        occurredAt: item.statusChangedAt ?? new Date(),
      },
      workItem: { id: item.id, key: item.key, title: item.title, status: item.status },
      member: item.assigneeMemberId ? { id: item.assigneeMemberId, name: item.assigneeName ?? '' } : null,
    })
  }

  return blockers.sort((a, b) => b.event.occurredAt.getTime() - a.event.occurredAt.getTime())
}

// Per-member activity summary over a window, for team/individual dashboards.
export async function getMemberActivity(workspaceId: string, sinceDays = 7, visibleMemberIds?: string[] | null) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({ memberId: events.memberId, type: events.type, count: count() })
    .from(events)
    .where(
      and(
        eq(events.workspaceId, workspaceId),
        gte(events.occurredAt, since),
        isNotNull(events.memberId),
        visibleMemberIds ? inArray(events.memberId, visibleMemberIds) : undefined,
      ),
    )
    .groupBy(events.memberId, events.type)

  const byMember = new Map<string, { total: number; byCategory: Record<string, number> }>()
  for (const row of rows) {
    if (!row.memberId) continue
    const entry = byMember.get(row.memberId) ?? { total: 0, byCategory: {} }
    entry.total += row.count
    const category = categorizeEventType(row.type)
    entry.byCategory[category] = (entry.byCategory[category] ?? 0) + row.count
    byMember.set(row.memberId, entry)
  }
  return byMember
}

// Daily event counts for sparkline-style charts.
export async function getDailyActivity(workspaceId: string, sinceDays = 14, visibleMemberIds?: string[] | null) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
  return db
    .select({
      day: sql<string>`to_char(${events.occurredAt}, 'YYYY-MM-DD')`,
      count: count(),
    })
    .from(events)
    .where(
      and(eq(events.workspaceId, workspaceId), gte(events.occurredAt, since), visibilityCondition(visibleMemberIds)),
    )
    .groupBy(sql`to_char(${events.occurredAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${events.occurredAt}, 'YYYY-MM-DD')`)
}
