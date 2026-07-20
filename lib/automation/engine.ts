import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  automationRules,
  type AutomationCondition,
  type AutomationConditionField,
  type AutomationRule,
  type WorkItemStatus,
} from '@/lib/db/schema'

export interface AutomationWorkItemContext {
  status: WorkItemStatus
  priority: number | null
  kind: string
  assigneeMemberId: string | null
  projectId: string
  labels: string[] | null
}

export interface AutomationContext {
  event: { type: string; source: string }
  workItem: AutomationWorkItemContext | null
}

function fieldValue(ctx: AutomationContext, field: AutomationConditionField): unknown {
  switch (field) {
    case 'event.source':
      return ctx.event.source
    case 'workItem.status':
      return ctx.workItem?.status
    case 'workItem.priority':
      return ctx.workItem?.priority
    case 'workItem.kind':
      return ctx.workItem?.kind
    case 'workItem.assigneeMemberId':
      return ctx.workItem?.assigneeMemberId
    case 'workItem.projectId':
      return ctx.workItem?.projectId
    case 'workItem.labels':
      return ctx.workItem?.labels ?? []
  }
}

function evaluateCondition(condition: AutomationCondition, ctx: AutomationContext): boolean {
  const actual = fieldValue(ctx, condition.field)
  switch (condition.op) {
    case 'eq':
      return actual === condition.value
    case 'neq':
      return actual !== condition.value
    case 'in':
      return (
        Array.isArray(condition.value) &&
        actual !== undefined &&
        actual !== null &&
        condition.value.includes(actual as string)
      )
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(condition.value)
      return typeof actual === 'string' && typeof condition.value === 'string' && actual.includes(condition.value)
  }
}

// Conditions with no work item to evaluate against (a workItem.* field on an
// unlinked event) simply don't match — a rule scoped to work-item state
// never fires on a workspace-wide event with nothing to check it against.
export function evaluateConditions(
  conditions: AutomationCondition[] | null | undefined,
  ctx: AutomationContext,
): boolean {
  if (!conditions || conditions.length === 0) return true
  return conditions.every((condition) => {
    if (condition.field.startsWith('workItem.') && !ctx.workItem) return false
    return evaluateCondition(condition, ctx)
  })
}

export async function findRulesForEventTypes(workspaceId: string, eventTypes: string[]): Promise<AutomationRule[]> {
  if (eventTypes.length === 0) return []
  return db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.workspaceId, workspaceId),
        inArray(automationRules.triggerEventType, eventTypes),
        eq(automationRules.enabled, true),
      ),
    )
}
