import type { WorkItemStatus } from '@/lib/db/schema'

// Canonical event types. Sources may emit anything dot-namespaced; these are
// the types Beacon understands deeply (status derivation, blocker detection…).
export const EVENT_TYPES = [
  // Work tracking
  'task.created',
  'task.updated',
  'task.started',
  'task.status_changed',
  'task.assigned',
  'task.commented',
  'task.relation_added',
  'task.relation_removed',
  'task.blocked',
  'task.unblocked',
  'task.completed',
  'task.cancelled',
  'task.due_soon',
  'task.overdue',
  'task.auto_closed',
  'task.archived',
  // Cycles (sprints)
  'sprint.started',
  'sprint.closed',
  'sprint.item_added',
  'sprint.item_removed',
  // Automation & project health
  'automation.executed',
  'project.update_posted',
  'project.stale',
  // Code
  'code.commit',
  'pr.opened',
  'pr.review_requested',
  'pr.changes_requested',
  'pr.approved',
  'pr.merged',
  'pr.closed',
  // CI/CD
  'ci.started',
  'ci.passed',
  'ci.failed',
  'deploy.started',
  'deploy.completed',
  'deploy.failed',
  // Coding agents
  'agent.session_started',
  'agent.planning',
  'agent.implementation_started',
  'agent.heartbeat',
  'agent.tests_passed',
  'agent.tests_failed',
  'agent.blocked',
  'agent.completed',
  // Communication & knowledge
  'message.posted',
  'meeting.scheduled',
  'meeting.updated',
  'meeting.cancelled',
  'meeting.rsvp',
  'meeting.held',
  'knowledge.added',
  'knowledge.signal',
  // Daily planning — the one intent signal members declare by hand
  'plan.declared',
  'plan.updated',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_CATEGORIES = {
  work: /^(task|sprint|automation|project|plan)\./,
  code: /^(code|pr)\./,
  cicd: /^(ci|deploy)\./,
  agent: /^agent\./,
  comms: /^(message|meeting)\./,
  knowledge: /^knowledge\./,
} as const

export type EventCategory = keyof typeof EVENT_CATEGORIES

export function categorizeEventType(type: string): EventCategory | 'other' {
  for (const [category, pattern] of Object.entries(EVENT_CATEGORIES)) {
    if (pattern.test(type)) return category as EventCategory
  }
  return 'other'
}

// How an event type moves the status of the work item it is attached to.
// This is the projection function: status = fold(events).
const STATUS_EFFECTS: Record<string, WorkItemStatus> = {
  'task.started': 'in_progress',
  'task.blocked': 'blocked',
  'agent.blocked': 'blocked',
  'task.unblocked': 'in_progress',
  'task.completed': 'done',
  'task.cancelled': 'cancelled',
  'agent.session_started': 'in_progress',
  'agent.implementation_started': 'in_progress',
  'agent.heartbeat': 'in_progress',
  'pr.opened': 'in_review',
  'pr.review_requested': 'in_review',
  'pr.changes_requested': 'in_progress',
  // pr.merged deliberately has no unconditional effect here: completing an
  // item on merge requires a *closing* magic word ("fixes/closes/resolves")
  // and, when several PRs are linked, the *last* one to merge — logic that
  // needs to inspect prior events, not a static type→status table. The
  // GitHub connector (lib/connectors/github.ts) makes that call and, when it
  // applies, emits an explicit task.status_changed → done itself.
}

export function statusEffectOf(type: string, payload?: Record<string, unknown>): WorkItemStatus | null {
  if (type === 'task.status_changed') {
    const next = payload?.status
    if (typeof next === 'string' && isWorkItemStatus(next)) return next
    return null
  }
  return STATUS_EFFECTS[type] ?? null
}

const WORK_ITEM_STATUS_SET = new Set([
  'triage',
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
])

export function isWorkItemStatus(value: string): value is WorkItemStatus {
  return WORK_ITEM_STATUS_SET.has(value)
}

// Event types that indicate someone is stuck. Used for blocker surfacing.
export const BLOCKING_EVENT_TYPES = new Set(['task.blocked', 'agent.blocked', 'ci.failed', 'agent.tests_failed'])
export const UNBLOCKING_EVENT_TYPES = new Set([
  'task.unblocked',
  'task.completed',
  'ci.passed',
  'agent.tests_passed',
  'agent.completed',
  'pr.merged',
])
