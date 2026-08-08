import 'server-only'

import { and, desc, eq, gte, inArray, isNotNull, lte, notInArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  dailyPlans,
  events,
  members,
  workItems,
  type AccessRole,
  type DailyPlan,
  type DailyPlanStatus,
  type WorkItemStatus,
} from '@/lib/db/schema'
import { visibleMemberIds } from '@/lib/auth/permissions'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'

// Roles that never file a daily plan — excluded from any roster this module
// builds, not just shown as permanently "not planned."
const NON_PLANNING_ROLES: AccessRole[] = ['admin', 'superadmin']

// One shared notion of "today" for both the composer and the founder-facing
// panel, so a plan submitted here is the same row read there. Server time
// (UTC on Vercel); the day flips at ~05:30 IST, which is fine for a work tool.
export function serverDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function startOfDateKey(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

export interface LinkedWorkItem {
  id: string
  key: string | null
  title: string
  status: WorkItemStatus
}

// Active work items assigned to this member — the picker's default suggestions
// so people can tag what they're on without hunting. Not a hard filter: the
// composer may still search the full list.
export async function getAssignedWorkItems(workspaceId: string, memberId: string): Promise<LinkedWorkItem[]> {
  return db
    .select({ id: workItems.id, key: workItems.key, title: workItems.title, status: workItems.status })
    .from(workItems)
    .where(
      and(
        eq(workItems.workspaceId, workspaceId),
        eq(workItems.assigneeMemberId, memberId),
        inArray(workItems.status, ['todo', 'in_progress', 'in_review', 'blocked']),
      ),
    )
    .orderBy(desc(workItems.updatedAt))
}

export async function getMemberPlan(memberId: string, date: string): Promise<DailyPlan | null> {
  const [row] = await db
    .select()
    .from(dailyPlans)
    .where(and(eq(dailyPlans.memberId, memberId), eq(dailyPlans.date, date)))
    .limit(1)
  return row ?? null
}

// The one-day-lookback carryover check: yesterday's plan, only if it was
// never resolved. Already-done or never-filed both mean nothing to prompt
// about — the prompt is specifically "you didn't close the loop on this."
export async function getYesterdaysUnresolvedPlan(memberId: string, today: string): Promise<DailyPlan | null> {
  const yesterday = serverDateKey(new Date(startOfDateKey(today).getTime() - 24 * 60 * 60 * 1000))
  const plan = await getMemberPlan(memberId, yesterday)
  return plan && plan.status === 'pending' ? plan : null
}

// Work items a member actually touched (via any attributed event) on a given
// day — the "actual" half of plan-vs-actual.
export async function getTouchedWorkItemIds(workspaceId: string, memberId: string, date: string): Promise<Set<string>> {
  const dayStart = startOfDateKey(date)
  const rows = await db
    .selectDistinct({ workItemId: events.workItemId })
    .from(events)
    .where(
      and(
        eq(events.workspaceId, workspaceId),
        eq(events.memberId, memberId),
        gte(events.occurredAt, dayStart),
        isNotNull(events.workItemId),
      ),
    )
  return new Set(rows.map((r) => r.workItemId).filter((id): id is string => Boolean(id)))
}

// Hydrate a set of linked work-item ids into display rows, workspace-scoped.
export async function hydrateWorkItems(workspaceId: string, ids: string[]): Promise<LinkedWorkItem[]> {
  if (ids.length === 0) return []
  return db
    .select({ id: workItems.id, key: workItems.key, title: workItems.title, status: workItems.status })
    .from(workItems)
    .where(and(eq(workItems.workspaceId, workspaceId), inArray(workItems.id, ids)))
}

export interface TodaysPlanRow {
  memberId: string
  memberName: string
  planned: boolean
  intention: string | null
  plannedCount: number
  touchedCount: number
}

// The founder-glance panel: every member this viewer may see, with today's
// declared intention (if any) and a light plan-vs-actual — how many of the
// linked items actually received activity today. Visibility-scoped exactly
// like event queries.
export async function getTodaysPlans(ctx: WorkspaceContext, date: string = serverDateKey()): Promise<TodaysPlanRow[]> {
  const scoped = await visibleMemberIds(ctx)

  const roster = await db
    .select({ id: members.id, name: members.name })
    .from(members)
    .where(
      and(
        eq(members.workspaceId, ctx.workspaceId),
        scoped ? inArray(members.id, scoped) : undefined,
        isNotNull(members.name),
        notInArray(members.accessRole, NON_PLANNING_ROLES),
      ),
    )
    .orderBy(members.name)

  const plans = await db
    .select({ memberId: dailyPlans.memberId, intention: dailyPlans.intention, workItemIds: dailyPlans.workItemIds })
    .from(dailyPlans)
    .where(and(eq(dailyPlans.workspaceId, ctx.workspaceId), eq(dailyPlans.date, date)))
  const planByMember = new Map(plans.map((p) => [p.memberId, p]))

  // Which work items actually got activity today, per member — for plan-vs-actual.
  const dayStart = startOfDateKey(date)
  const touchedRows = await db
    .selectDistinct({ memberId: events.memberId, workItemId: events.workItemId })
    .from(events)
    .where(
      and(
        eq(events.workspaceId, ctx.workspaceId),
        gte(events.occurredAt, dayStart),
        isNotNull(events.memberId),
        isNotNull(events.workItemId),
      ),
    )
  const touchedByMember = new Map<string, Set<string>>()
  for (const row of touchedRows) {
    if (!row.memberId || !row.workItemId) continue
    const set = touchedByMember.get(row.memberId) ?? new Set<string>()
    set.add(row.workItemId)
    touchedByMember.set(row.memberId, set)
  }

  return roster.map((member) => {
    const plan = planByMember.get(member.id)
    const plannedIds = plan?.workItemIds ?? []
    const touched = touchedByMember.get(member.id) ?? new Set<string>()
    return {
      memberId: member.id,
      memberName: member.name,
      planned: Boolean(plan),
      intention: plan?.intention ?? null,
      plannedCount: plannedIds.length,
      touchedCount: plannedIds.filter((id) => touched.has(id)).length,
    }
  })
}

export interface PlanHistoryRow {
  id: string
  memberId: string
  memberName: string
  date: string
  intention: string
  status: DailyPlanStatus
}

export interface PlansHistoryFilters {
  memberId?: string
  from?: string
  to?: string
  sinceDays?: number
}

// Admin-facing "/plans" page: every plan across the workspace over a lookback
// window, newest first — deliberately lean (no plan-vs-actual counts; that
// detail is one click away via PlanDetailDialog) since the ask here is just
// "see the plan, see done-or-pending." An explicit `from` replaces the
// default lookback window entirely rather than combining with it, same as
// picking a date range means "show me this range," not "this range within
// the last two weeks."
export async function getPlansHistory(
  workspaceId: string,
  filters: PlansHistoryFilters = {},
): Promise<PlanHistoryRow[]> {
  const { memberId, from, to, sinceDays = 14 } = filters
  const since = from ?? serverDateKey(new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000))
  return db
    .select({
      id: dailyPlans.id,
      memberId: dailyPlans.memberId,
      memberName: members.name,
      date: dailyPlans.date,
      intention: dailyPlans.intention,
      status: dailyPlans.status,
    })
    .from(dailyPlans)
    .innerJoin(members, eq(members.id, dailyPlans.memberId))
    .where(
      and(
        eq(dailyPlans.workspaceId, workspaceId),
        gte(dailyPlans.date, since),
        to ? lte(dailyPlans.date, to) : undefined,
        memberId ? eq(dailyPlans.memberId, memberId) : undefined,
      ),
    )
    .orderBy(desc(dailyPlans.date), members.name)
}
