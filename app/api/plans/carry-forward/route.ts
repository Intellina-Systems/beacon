import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { getMemberPlan, serverDateKey } from '@/lib/plans/queries'
import { setPlanStatus, upsertDailyPlan } from '@/lib/plans/upsert'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const carryForwardSchema = z.object({
  fromDate: z.string().regex(DATE_RE, 'fromDate must be YYYY-MM-DD'),
})

// "Continue" on the yesterday-carryover prompt: copies that day's plan into
// today and marks the source day done — continuing an open plan is itself
// the resolution of "was it done," so it doesn't stay dangling pending.
export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = carryForwardSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const source = await getMemberPlan(ctx.member.id, parsed.data.fromDate)
  if (!source) return Response.json({ error: 'No plan found for that date' }, { status: 404 })

  const today = serverDateKey()
  const result = await upsertDailyPlan(ctx, {
    date: today,
    intention: source.intention,
    workItemIds: source.workItemIds,
  })
  await setPlanStatus(ctx, parsed.data.fromDate, 'done')

  return Response.json({ ok: true, date: result.date, intention: result.intention, workItemIds: result.workItemIds })
}
