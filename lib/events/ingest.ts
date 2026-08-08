import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import {
  cycles,
  events,
  members,
  notifications,
  workItems,
  workItemWatchers,
  EVENT_INSTRUMENTATIONS,
  type AutomationAction,
  type InsertEvent,
  type Member,
  type WorkItemStatus,
} from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { statusEffectOf } from './taxonomy'
import { evaluateConditions, findRulesForEventTypes, type AutomationContext } from '@/lib/automation/engine'

// Statuses that qualify a work item to auto-join its project's active cycle,
// mirroring Linear: any issue reaching started-or-later without a cycle joins
// the current one, so cycle membership stays honest without process discipline.
const CYCLE_JOINING_STATUSES = new Set(['in_progress', 'in_review', 'blocked', 'done'])

// Automation actions can themselves produce events that match other rules
// (or the same rule again). Bound the cascade so a misconfigured loop of
// rules can't recurse forever — legitimate chains are 1-2 hops deep.
const MAX_AUTOMATION_DEPTH = 3

// Wire format accepted by POST /api/events — what agents, CI, and plugins send.
export const rawEventSchema = z.object({
  type: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/, 'type must be dot-namespaced, e.g. "task.started"'),
  source: z
    .enum(['github', 'linear', 'cicd', 'slack', 'calendar', 'agent', 'knowledge', 'manual', 'system'])
    .optional(),
  summary: z.string().max(500).optional(),
  // Correlation handles — any of these may identify the work item / engineer
  task: z.string().max(200).optional(), // work item key ("BCN-42") or id
  engineer: z.string().max(200).optional(), // member name, alias, github login…
  externalId: z.string().max(300).optional(),
  reason: z.string().max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  occurredAt: z.coerce.date().optional(),
  // Repository the work is happening in, e.g. "Intellina-Systems/beacon".
  repo: z.string().max(300).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  // Correlates events from the same coding-agent session, and which of the
  // beacon-insights skill's two reporting paths sent this one — both wired
  // through by the skill's hooks/send-event helper, not something a caller
  // is expected to construct by hand. See the `events.sessionId`/
  // `events.instrumentation` column comments in schema.ts.
  sessionId: z.string().max(200).optional(),
  instrumentation: z.enum(EVENT_INSTRUMENTATIONS).optional(),
})

export type RawEvent = z.infer<typeof rawEventSchema>

export interface IngestOptions {
  workspaceId: string
  defaultSource?: InsertEvent['source']
  /** Internal — bounds automation cascades. Never set this from calling code. */
  depth?: number
}

export interface IngestResult {
  inserted: number
  deduplicated: number
  eventIds: string[]
}

function defaultSummary(raw: RawEvent): string {
  const bits = [raw.type]
  if (raw.task) bits.push(raw.task)
  if (raw.reason) bits.push(raw.reason)
  return bits.join(' — ').slice(0, 500)
}

function memberMatches(member: Member, needle: string): boolean {
  const lower = needle.trim().toLowerCase()
  return (
    member.name.toLowerCase() === lower ||
    member.email?.toLowerCase() === lower ||
    member.githubUsername?.toLowerCase() === lower ||
    member.slackHandle?.toLowerCase() === lower ||
    (member.aliases ?? []).some((alias) => alias.toLowerCase() === lower)
  )
}

export function resolveMember(roster: Member[], label: string | undefined | null): Member | null {
  if (!label) return null
  return roster.find((member) => memberMatches(member, label)) ?? null
}

// Ingest a batch of events: resolve identities, dedupe, append, and fold the
// status effects into the referenced work items.
export async function ingestEvents(rawEvents: RawEvent[], options: IngestOptions): Promise<IngestResult> {
  const { workspaceId, defaultSource = 'manual', depth = 0 } = options
  if (rawEvents.length === 0) return { inserted: 0, deduplicated: 0, eventIds: [] }

  const roster = await db.select().from(members).where(eq(members.workspaceId, workspaceId))

  // Resolve work item handles (key, external id, or internal id) in one query
  const taskHandles = Array.from(new Set(rawEvents.map((raw) => raw.task).filter((t): t is string => Boolean(t))))
  const workItemRows = taskHandles.length
    ? await db
        .select({ id: workItems.id, key: workItems.key, externalId: workItems.externalId })
        .from(workItems)
        .where(
          and(
            eq(workItems.workspaceId, workspaceId),
            sql`(${inArray(workItems.id, taskHandles)} or ${inArray(workItems.key, taskHandles)} or ${inArray(workItems.externalId, taskHandles)})`,
          ),
        )
    : []

  const workItemByHandle = new Map<string, string>()
  for (const row of workItemRows) {
    workItemByHandle.set(row.id, row.id)
    if (row.key) workItemByHandle.set(row.key, row.id)
    if (row.externalId) workItemByHandle.set(row.externalId, row.id)
  }

  const now = new Date()
  const inserts: InsertEvent[] = rawEvents.map((raw) => {
    const member = resolveMember(roster, raw.engineer)
    const workItemId = raw.task ? (workItemByHandle.get(raw.task) ?? null) : null
    return {
      id: generateId(16),
      workspaceId,
      source: raw.source ?? defaultSource,
      type: raw.type,
      memberId: member?.id ?? null,
      actorLabel: raw.engineer ?? member?.name ?? null,
      workItemId,
      summary: raw.summary ?? defaultSummary(raw),
      payload: {
        ...(raw.payload ?? {}),
        ...(raw.reason ? { reason: raw.reason } : {}),
        ...(raw.task && !workItemId ? { unresolvedTask: raw.task } : {}),
      },
      repo: raw.repo ?? null,
      externalId: raw.externalId ?? null,
      confidence: raw.confidence ?? null,
      sessionId: raw.sessionId ?? null,
      instrumentation: raw.instrumentation ?? null,
      occurredAt: raw.occurredAt ?? now,
    }
  })

  const insertedRows = await db
    .insert(events)
    .values(inserts)
    .onConflictDoNothing({ target: [events.workspaceId, events.source, events.externalId] })
    .returning({
      id: events.id,
      workItemId: events.workItemId,
      memberId: events.memberId,
      type: events.type,
      source: events.source,
      occurredAt: events.occurredAt,
    })

  // Fold status effects into referenced work items, latest event wins
  const statusUpdates = new Map<string, { status: string; at: Date }>()
  for (const raw of rawEvents) {
    const workItemId = raw.task ? workItemByHandle.get(raw.task) : null
    if (!workItemId) continue
    const effect = statusEffectOf(raw.type, raw.payload)
    const at = raw.occurredAt ?? now
    if (effect) {
      const existing = statusUpdates.get(workItemId)
      if (!existing || at >= existing.at) statusUpdates.set(workItemId, { status: effect, at })
    }
  }

  const touchedWorkItemIds = new Set(insertedRows.map((row) => row.workItemId).filter((id): id is string => !!id))

  await Promise.all([
    ...Array.from(statusUpdates.entries()).map(([workItemId, { status, at }]) =>
      db
        .update(workItems)
        .set({ status: status as never, statusChangedAt: at, lastEventAt: at, updatedAt: now })
        .where(and(eq(workItems.id, workItemId), eq(workItems.workspaceId, workspaceId))),
    ),
    ...Array.from(touchedWorkItemIds)
      .filter((id) => !statusUpdates.has(id))
      .map((workItemId) =>
        db
          .update(workItems)
          .set({ lastEventAt: now, updatedAt: now })
          .where(and(eq(workItems.id, workItemId), eq(workItems.workspaceId, workspaceId))),
      ),
  ])

  await fanOutNotifications(workspaceId, insertedRows)
  await autoJoinActiveCycles(workspaceId, statusUpdates)
  await runAutomationRules(workspaceId, insertedRows, roster, depth)

  return {
    inserted: insertedRows.length,
    deduplicated: inserts.length - insertedRows.length,
    eventIds: insertedRows.map((row) => row.id),
  }
}

// After a status fold, any item that just reached started-or-later with no
// cycle yet, whose project has a currently active cycle, joins it. Emits its
// own sprint.item_added event through the normal pipeline (dedup, watcher
// fan-out) — a bounded, non-recursive follow-up call, since sprint.* events
// have no further status or cycle effect of their own.
async function autoJoinActiveCycles(
  workspaceId: string,
  statusUpdates: Map<string, { status: string; at: Date }>,
): Promise<void> {
  const candidateIds = Array.from(statusUpdates.entries())
    .filter(([, { status }]) => CYCLE_JOINING_STATUSES.has(status))
    .map(([id]) => id)
  if (candidateIds.length === 0) return

  const rows = await db
    .select({ id: workItems.id, key: workItems.key, title: workItems.title, projectId: workItems.projectId })
    .from(workItems)
    .where(and(eq(workItems.workspaceId, workspaceId), inArray(workItems.id, candidateIds), isNull(workItems.cycleId)))
  if (rows.length === 0) return

  const now = new Date()
  const projectIds = Array.from(new Set(rows.map((r) => r.projectId)))
  const activeCycles = await db
    .select({ id: cycles.id, projectId: cycles.projectId })
    .from(cycles)
    .where(
      and(
        inArray(cycles.projectId, projectIds),
        isNull(cycles.closedAt),
        lte(cycles.startsAt, now),
        gte(cycles.endsAt, now),
      ),
    )
  if (activeCycles.length === 0) return
  const activeCycleByProject = new Map(activeCycles.map((c) => [c.projectId, c.id]))

  const joinEvents: RawEvent[] = []
  for (const item of rows) {
    const cycleId = activeCycleByProject.get(item.projectId)
    if (!cycleId) continue
    await db.update(workItems).set({ cycleId, updatedAt: now }).where(eq(workItems.id, item.id))
    joinEvents.push({
      type: 'sprint.item_added',
      source: 'system',
      summary: `${item.key ?? item.title} auto-joined the active cycle`,
      task: item.id,
      externalId: `workitem:${item.id}:cycle:${cycleId}:joined`,
      payload: { cycleId, reason: 'auto-joined-active-cycle' },
    })
  }
  if (joinEvents.length > 0) await ingestEvents(joinEvents, { workspaceId, defaultSource: 'system' })
}

interface NotifiableEvent {
  id: string
  workItemId: string | null
  memberId: string | null
}

// Inbox fan-out: one notification per (watcher, event) for events attached to
// a watched work item — skipping the actor so people aren't notified about
// their own changes. Failures here must never fail the ingest itself.
async function fanOutNotifications(workspaceId: string, insertedRows: NotifiableEvent[]): Promise<void> {
  const watchedItemIds = Array.from(
    new Set(insertedRows.map((row) => row.workItemId).filter((id): id is string => !!id)),
  )
  if (watchedItemIds.length === 0) return

  try {
    const watcherRows = await db
      .select({ workItemId: workItemWatchers.workItemId, memberId: workItemWatchers.memberId })
      .from(workItemWatchers)
      .where(inArray(workItemWatchers.workItemId, watchedItemIds))
    if (watcherRows.length === 0) return

    const watchersByItem = new Map<string, string[]>()
    for (const row of watcherRows) {
      const list = watchersByItem.get(row.workItemId) ?? []
      list.push(row.memberId)
      watchersByItem.set(row.workItemId, list)
    }

    const rows = insertedRows.flatMap((event) => {
      if (!event.workItemId) return []
      return (watchersByItem.get(event.workItemId) ?? [])
        .filter((memberId) => memberId !== event.memberId)
        .map((memberId) => ({
          id: generateId(),
          workspaceId,
          memberId,
          eventId: event.id,
          workItemId: event.workItemId,
        }))
    })
    if (rows.length === 0) return

    await db
      .insert(notifications)
      .values(rows)
      .onConflictDoNothing({ target: [notifications.memberId, notifications.eventId] })
  } catch (error) {
    console.error('[events] notification fan-out failed:', error)
  }
}

interface AutomationInsertedEvent {
  id: string
  workItemId: string | null
  memberId: string | null
  type: string
  source: string
}

// Evaluate every enabled automation rule whose trigger matches one of this
// batch's event types, against the current (post-fold) state of any linked
// work item. Matching rules mutate the item directly (mirroring the
// work-items PATCH route) and the resulting changes re-enter the pipeline as
// ordinary events — depth-guarded so a rule can't cascade into itself forever.
async function runAutomationRules(
  workspaceId: string,
  insertedRows: AutomationInsertedEvent[],
  roster: Member[],
  depth: number,
): Promise<void> {
  if (depth >= MAX_AUTOMATION_DEPTH) return

  const eventTypes = Array.from(new Set(insertedRows.map((row) => row.type)))
  const rules = await findRulesForEventTypes(workspaceId, eventTypes)
  if (rules.length === 0) return

  const rulesByTrigger = new Map<string, typeof rules>()
  for (const rule of rules) {
    const list = rulesByTrigger.get(rule.triggerEventType) ?? []
    list.push(rule)
    rulesByTrigger.set(rule.triggerEventType, list)
  }

  const workItemIds = Array.from(new Set(insertedRows.map((row) => row.workItemId).filter((id): id is string => !!id)))
  const itemRows = workItemIds.length
    ? await db
        .select({
          id: workItems.id,
          key: workItems.key,
          title: workItems.title,
          status: workItems.status,
          priority: workItems.priority,
          kind: workItems.kind,
          assigneeMemberId: workItems.assigneeMemberId,
          projectId: workItems.projectId,
          labels: workItems.labels,
        })
        .from(workItems)
        .where(inArray(workItems.id, workItemIds))
    : []
  const itemById = new Map(itemRows.map((item) => [item.id, item]))
  const memberById = new Map(roster.map((m) => [m.id, m]))

  const now = new Date()
  const followUpEvents: RawEvent[] = []
  const notifyRows: {
    id: string
    workspaceId: string
    memberId: string
    eventId: string
    workItemId: string | null
  }[] = []

  for (const row of insertedRows) {
    const matchingRules = rulesByTrigger.get(row.type)
    if (!matchingRules) continue

    const item = row.workItemId ? itemById.get(row.workItemId) : undefined
    const ctx: AutomationContext = {
      event: { type: row.type, source: row.source },
      workItem: item
        ? {
            status: item.status,
            priority: item.priority,
            kind: item.kind,
            assigneeMemberId: item.assigneeMemberId,
            projectId: item.projectId,
            labels: item.labels,
          }
        : null,
    }

    for (const rule of matchingRules) {
      if (!evaluateConditions(rule.conditions, ctx)) continue

      let anyApplied = false
      for (const action of rule.actions) {
        const applied = await applyAutomationAction(action, row, item, memberById, now)
        if (applied) anyApplied = true
        if (applied?.followUpEvent) followUpEvents.push(applied.followUpEvent)
        if (applied?.notifyMemberId) {
          notifyRows.push({
            id: generateId(),
            workspaceId,
            memberId: applied.notifyMemberId,
            eventId: row.id,
            workItemId: row.workItemId,
          })
        }
        // Local state used by subsequent actions in the same rule stays in
        // sync with what was just written (e.g. set_status then notify).
        if (applied?.updatedItem && item) Object.assign(item, applied.updatedItem)
      }

      if (anyApplied) {
        followUpEvents.push({
          type: 'automation.executed',
          source: 'system',
          summary: `Rule "${rule.name}" fired on ${item?.key ?? item?.title ?? row.type}`,
          task: row.workItemId ?? undefined,
          payload: { ruleId: rule.id, ruleName: rule.name, triggerEventId: row.id, triggerType: row.type },
        })
      }
    }
  }

  if (notifyRows.length > 0) {
    await db
      .insert(notifications)
      .values(notifyRows)
      .onConflictDoNothing({ target: [notifications.memberId, notifications.eventId] })
  }
  if (followUpEvents.length > 0) {
    await ingestEvents(followUpEvents, { workspaceId, defaultSource: 'system', depth: depth + 1 })
  }
}

type AutomationWorkItemRow = {
  id: string
  key: string | null
  title: string
  status: WorkItemStatus
  priority: number | null
  assigneeMemberId: string | null
  labels: string[] | null
}

interface AppliedAction {
  followUpEvent?: RawEvent
  notifyMemberId?: string
  updatedItem?: Partial<AutomationWorkItemRow>
}

// Applies one action of a fired rule: mutates the work item directly (same
// granularity as the work-items PATCH route) and returns the audit event /
// notification to emit. Returns undefined when the action can't resolve
// (e.g. set_assignee: "trigger_actor" on an unattributed event).
async function applyAutomationAction(
  action: AutomationAction,
  triggerRow: AutomationInsertedEvent,
  item: AutomationWorkItemRow | undefined,
  memberById: Map<string, Member>,
  now: Date,
): Promise<AppliedAction | undefined> {
  if (!item) {
    // notify is the only action meaningful without a linked work item.
    if (action.type === 'notify' && typeof action.value === 'string' && action.value !== 'assignee') {
      return { notifyMemberId: action.value }
    }
    return undefined
  }

  const label = item.key ?? item.title

  switch (action.type) {
    case 'set_status': {
      if (typeof action.value !== 'string' || action.value === item.status) return undefined
      const previousStatus = item.status
      await db
        .update(workItems)
        .set({ status: action.value as never, statusChangedAt: now, updatedAt: now })
        .where(eq(workItems.id, item.id))
      return {
        updatedItem: { status: action.value as WorkItemStatus },
        followUpEvent: {
          type: 'task.status_changed',
          source: 'system',
          summary: `${label} moved to ${action.value.replace('_', ' ')} by automation`,
          task: item.id,
          payload: { status: action.value, previousStatus, automated: true },
        },
      }
    }
    case 'set_assignee': {
      const targetId = action.value === 'trigger_actor' ? triggerRow.memberId : (action.value as string | null)
      if (targetId !== null && targetId !== undefined && !memberById.has(targetId)) return undefined
      if (targetId === item.assigneeMemberId) return undefined
      await db
        .update(workItems)
        .set({ assigneeMemberId: targetId ?? null, updatedAt: now })
        .where(eq(workItems.id, item.id))
      return {
        updatedItem: { assigneeMemberId: targetId ?? null },
        followUpEvent: {
          type: 'task.assigned',
          source: 'system',
          summary: targetId
            ? `${label} assigned to ${memberById.get(targetId)?.name ?? targetId} by automation`
            : `${label} unassigned by automation`,
          task: item.id,
          payload: {
            assigneeMemberId: targetId ?? null,
            previousAssigneeMemberId: item.assigneeMemberId,
            automated: true,
          },
        },
      }
    }
    case 'set_priority': {
      if (typeof action.value !== 'number' || action.value === item.priority) return undefined
      await db.update(workItems).set({ priority: action.value, updatedAt: now }).where(eq(workItems.id, item.id))
      return {
        updatedItem: { priority: action.value },
        followUpEvent: {
          type: 'task.updated',
          source: 'system',
          summary: `${label} priority set by automation`,
          task: item.id,
          payload: { field: 'priority', priority: action.value, previousPriority: item.priority, automated: true },
        },
      }
    }
    case 'add_label': {
      if (typeof action.value !== 'string') return undefined
      const current = item.labels ?? []
      if (current.includes(action.value)) return undefined
      const nextLabels = [...current, action.value]
      await db.update(workItems).set({ labels: nextLabels, updatedAt: now }).where(eq(workItems.id, item.id))
      return {
        updatedItem: { labels: nextLabels },
        followUpEvent: {
          type: 'task.updated',
          source: 'system',
          summary: `${label} labeled "${action.value}" by automation`,
          task: item.id,
          payload: { field: 'labels', labels: nextLabels, automated: true },
        },
      }
    }
    case 'notify': {
      const targetId = action.value === 'assignee' ? item.assigneeMemberId : (action.value as string | null)
      if (!targetId) return undefined
      return { notifyMemberId: targetId }
    }
  }
}
