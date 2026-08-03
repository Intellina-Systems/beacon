import 'server-only'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { dailyPlans, type DailyPlanStatus } from '@/lib/db/schema'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'
import { ingestEvents } from '@/lib/events/ingest'
import { generateId } from '@/lib/utils/id'
import { getMemberPlan, hydrateWorkItems } from './queries'

export interface UpsertPlanInput {
  date: string
  intention: string
  workItemIds?: string[]
}

export interface UpsertPlanResult {
  created: boolean
  date: string
  intention: string
  workItemIds: string[]
}

// Shared by POST /api/plans (the composer) and POST /api/plans/carry-forward
// (continuing yesterday's plan into today) so both take the identical
// update-or-insert + plan.declared/plan.updated event path — the two can
// never drift on what "saving a plan" actually does.
export async function upsertDailyPlan(ctx: WorkspaceContext, input: UpsertPlanInput): Promise<UpsertPlanResult> {
  const intention = input.intention.trim()

  // Keep only work items that really belong to this workspace — never trust
  // ids from the caller for cross-tenant linking.
  const requestedIds = input.workItemIds ?? []
  const valid = await hydrateWorkItems(ctx.workspaceId, requestedIds)
  const workItemIds = valid.map((item) => item.id)

  const existing = await getMemberPlan(ctx.member.id, input.date)
  const now = new Date()

  if (existing) {
    await db.update(dailyPlans).set({ intention, workItemIds, updatedAt: now }).where(eq(dailyPlans.id, existing.id))
  } else {
    await db.insert(dailyPlans).values({
      id: generateId(16),
      workspaceId: ctx.workspaceId,
      memberId: ctx.member.id,
      date: input.date,
      intention,
      workItemIds,
    })
  }

  // Append the intent to the event stream so it shows on the timeline/Pulse
  // and feeds plan-vs-actual. Attributed to the member via their name.
  await ingestEvents(
    [
      {
        type: existing ? 'plan.updated' : 'plan.declared',
        source: 'manual',
        engineer: ctx.member.name,
        summary: `${existing ? 'Updated' : 'Planned'} today: ${intention}`.slice(0, 200),
        occurredAt: now,
        payload: { date: input.date, workItemIds },
      },
    ],
    { workspaceId: ctx.workspaceId, defaultSource: 'manual' },
  )

  return { created: !existing, date: input.date, intention, workItemIds }
}

// Toggles a plan's completion state. Scoped to the caller's own plans — date
// can be any day the caller has a plan for (today, via the composer, or a
// past day, via carry-forward resolving yesterday's open plan).
export async function setPlanStatus(
  ctx: WorkspaceContext,
  date: string,
  status: DailyPlanStatus,
): Promise<{ ok: boolean }> {
  const existing = await getMemberPlan(ctx.member.id, date)
  if (!existing) return { ok: false }

  await db
    .update(dailyPlans)
    .set({ status, completedAt: status === 'done' ? new Date() : null, updatedAt: new Date() })
    .where(eq(dailyPlans.id, existing.id))

  return { ok: true }
}
