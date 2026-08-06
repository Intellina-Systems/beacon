import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
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
  // Absolute range (inclusive) — distinct from `sinceDays`, which is relative
  // to now. Used by the Timeline date-range filter.
  startDate?: Date
  endDate?: Date
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
  if (filters.startDate) conditions.push(gte(events.occurredAt, filters.startDate))
  if (filters.endDate) conditions.push(lte(events.occurredAt, filters.endDate))
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

export interface LiveActor {
  memberId: string | null
  /** Roster name when resolved, otherwise the raw actor label from the source. */
  name: string
  /**
   * Every raw actor label this person's events arrived under (github login,
   * agent alias, short handle). Without these the same human shows up as
   * "satya" in one section and "Satyanarayana J" in another, and the model
   * treats them as two different people.
   */
  aliases: string[]
  eventCount: number
  lastAt: Date
  lastSummary: string
  lastType: string
  repos: string[]
  sources: string[]
  /** True when an agent.* event arrived and no agent.completed followed it. */
  agentRunning: boolean
}

// Who is actually doing something in the recent window, derived from the event
// stream rather than work-item status. Work items only move when someone
// remembers to move them; events land continuously, so this is what answers
// "what is everyone doing right now" — including agent sessions that never
// have an issue attached.
export async function getLiveActivity(
  workspaceId: string,
  hoursBack = 12,
  visibleMemberIds?: string[] | null,
): Promise<LiveActor[]> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  const rows = await db
    .select({
      memberId: events.memberId,
      actorLabel: events.actorLabel,
      memberName: members.name,
      type: events.type,
      source: events.source,
      summary: events.summary,
      repo: events.repo,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .leftJoin(members, eq(members.id, events.memberId))
    .where(
      and(
        eq(events.workspaceId, workspaceId),
        gte(events.occurredAt, since),
        visibleMemberIds
          ? or(
              inArray(events.memberId, visibleMemberIds.length ? visibleMemberIds : ['__none__']),
              isNull(events.memberId),
            )
          : undefined,
      ),
    )
    .orderBy(desc(events.occurredAt))
    .limit(600)

  const byActor = new Map<string, LiveActor & { sawCompleted: boolean; sawAgentStart: boolean }>()

  for (const row of rows) {
    const name = row.memberName ?? row.actorLabel
    // Unattributed events (webhooks with no resolvable actor) aren't useful for
    // a "who is doing what" answer — they'd render as a nameless bullet.
    if (!name) continue
    const key = row.memberId ?? `label:${name}`

    let entry = byActor.get(key)
    if (!entry) {
      // Rows arrive newest-first, so the first one seen is the latest.
      entry = {
        memberId: row.memberId,
        name,
        aliases: [],
        eventCount: 0,
        lastAt: row.occurredAt,
        lastSummary: row.summary,
        lastType: row.type,
        repos: [],
        sources: [],
        agentRunning: false,
        sawCompleted: false,
        sawAgentStart: false,
      }
      byActor.set(key, entry)
    }

    entry.eventCount += 1
    if (row.repo && !entry.repos.includes(row.repo)) entry.repos.push(row.repo)
    if (!entry.sources.includes(row.source)) entry.sources.push(row.source)
    // Track the raw label separately from the resolved name so the prompt can
    // publish both and the model can map either back to one person.
    if (row.actorLabel && row.actorLabel !== entry.name && !entry.aliases.includes(row.actorLabel)) {
      entry.aliases.push(row.actorLabel)
    }

    if (row.type.startsWith('agent.')) {
      // Walking newest → oldest: a completion seen before any start means the
      // most recent agent run finished.
      if (row.type === 'agent.completed') entry.sawCompleted = true
      else if (!entry.sawCompleted) entry.sawAgentStart = true
    }
  }

  return [...byActor.values()]
    .map(({ sawCompleted, sawAgentStart, ...actor }) => ({ ...actor, agentRunning: sawAgentStart && !sawCompleted }))
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
}

export interface UnmatchedActor {
  actorLabel: string
  eventCount: number
  lastSeenAt: Date
}

// Every actor label that has never resolved to a roster member — the raw
// name/login string is always kept on the event (see events.actorLabel)
// independent of whether resolveMember found a match, so this is a plain
// aggregation over events already ingested, not a new signal.
export async function getUnmatchedActors(workspaceId: string, limit = 50): Promise<UnmatchedActor[]> {
  const rows = await db
    .select({
      actorLabel: events.actorLabel,
      eventCount: count(events.id),
      lastSeenAt: sql<Date>`max(${events.occurredAt})`,
    })
    .from(events)
    .where(and(eq(events.workspaceId, workspaceId), isNull(events.memberId), isNotNull(events.actorLabel)))
    .groupBy(events.actorLabel)
    .orderBy(desc(sql`max(${events.occurredAt})`))
    .limit(limit)

  return rows
    .filter((row): row is typeof row & { actorLabel: string } => row.actorLabel !== null)
    .map((row) => ({
      actorLabel: row.actorLabel,
      eventCount: row.eventCount,
      // sql<Date> is only a type assertion — max() over a raw sql fragment
      // comes back from the driver as a string, unlike normal column selects
      // which go through Drizzle's timestamp-mode conversion.
      lastSeenAt: row.lastSeenAt instanceof Date ? row.lastSeenAt : new Date(row.lastSeenAt),
    }))
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
