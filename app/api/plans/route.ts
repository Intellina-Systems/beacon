import { z } from 'zod'
import { DAILY_PLAN_STATUSES } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { getAssignedWorkItems, getMemberPlan, hydrateWorkItems, serverDateKey } from '@/lib/plans/queries'
import { setPlanStatus, upsertDailyPlan } from '@/lib/plans/upsert'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const dateParam = url.searchParams.get('date')
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : serverDateKey()

  const plan = await getMemberPlan(ctx.member.id, date)
  const [assigned, linked] = await Promise.all([
    getAssignedWorkItems(ctx.workspaceId, ctx.member.id),
    plan ? hydrateWorkItems(ctx.workspaceId, plan.workItemIds) : Promise.resolve([]),
  ])

  return Response.json({
    date,
    plan: plan
      ? { intention: plan.intention, workItemIds: plan.workItemIds, status: plan.status, updatedAt: plan.updatedAt }
      : null,
    linked,
    assigned,
  })
}

const upsertSchema = z.object({
  date: z.string().regex(DATE_RE, 'date must be YYYY-MM-DD').optional(),
  intention: z.string().min(1, 'Say what you plan to work on').max(2000),
  workItemIds: z.array(z.string()).max(50).optional(),
})

export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const date = parsed.data.date ?? serverDateKey()

  const result = await upsertDailyPlan(ctx, {
    date,
    intention: parsed.data.intention,
    workItemIds: parsed.data.workItemIds,
  })

  return Response.json(
    { ok: true, date: result.date, intention: result.intention, workItemIds: result.workItemIds },
    { status: result.created ? 201 : 200 },
  )
}

const statusSchema = z.object({
  date: z.string().regex(DATE_RE, 'date must be YYYY-MM-DD'),
  status: z.enum(DAILY_PLAN_STATUSES),
})

// Scoped to the caller's own plans — matches upsert's "you can only ever
// write your own plan" rule.
export async function PATCH(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = statusSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const result = await setPlanStatus(ctx, parsed.data.date, parsed.data.status)
  if (!result.ok) return Response.json({ error: 'No plan found for that date' }, { status: 404 })

  return Response.json({ ok: true, date: parsed.data.date, status: parsed.data.status })
}
