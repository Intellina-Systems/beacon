import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { dailyPlans } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ingestEvents } from '@/lib/events/ingest'
import { generateId } from '@/lib/utils/id'
import { getAssignedWorkItems, getMemberPlan, hydrateWorkItems, serverDateKey } from '@/lib/plans/queries'

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
    plan: plan ? { intention: plan.intention, workItemIds: plan.workItemIds, updatedAt: plan.updatedAt } : null,
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
  const intention = parsed.data.intention.trim()

  // Keep only work items that really belong to this workspace — never trust
  // ids from the client for cross-tenant linking.
  const requestedIds = parsed.data.workItemIds ?? []
  const valid = await hydrateWorkItems(ctx.workspaceId, requestedIds)
  const workItemIds = valid.map((item) => item.id)

  const existing = await getMemberPlan(ctx.member.id, date)
  const now = new Date()

  if (existing) {
    await db.update(dailyPlans).set({ intention, workItemIds, updatedAt: now }).where(eq(dailyPlans.id, existing.id))
  } else {
    await db.insert(dailyPlans).values({
      id: generateId(16),
      workspaceId: ctx.workspaceId,
      memberId: ctx.member.id,
      date,
      intention,
      workItemIds,
    })
  }

  // Append the intent to the event stream so it shows on the timeline/Pulse and
  // feeds plan-vs-actual. Attributed to the member via their name.
  await ingestEvents(
    [
      {
        type: existing ? 'plan.updated' : 'plan.declared',
        source: 'manual',
        engineer: ctx.member.name,
        summary: `${existing ? 'Updated' : 'Planned'} today: ${intention}`.slice(0, 200),
        occurredAt: now,
        payload: { date, workItemIds },
      },
    ],
    { workspaceId: ctx.workspaceId, defaultSource: 'manual' },
  )

  return Response.json({ ok: true, date, intention, workItemIds }, { status: existing ? 200 : 201 })
}
