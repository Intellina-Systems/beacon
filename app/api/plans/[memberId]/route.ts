import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { visibleMemberIds } from '@/lib/auth/permissions'
import { getMemberPlan, getTouchedWorkItemIds, hydrateWorkItems, serverDateKey } from '@/lib/plans/queries'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// A single member's full plan for a day, for the Pulse drill-in. Visibility-
// scoped exactly like the roster: admins/managers see everyone, others see
// their teams + self.
export async function GET(req: Request, { params }: { params: Promise<{ memberId: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { memberId } = await params

  const scoped = await visibleMemberIds(ctx)
  if (scoped && !scoped.includes(memberId)) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(req.url)
  const dateParam = url.searchParams.get('date')
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : serverDateKey()

  const [member] = await db
    .select({ name: members.name })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!member) return Response.json({ error: 'Not found' }, { status: 404 })

  const plan = await getMemberPlan(memberId, date)
  const [linked, touched] = await Promise.all([
    plan ? hydrateWorkItems(ctx.workspaceId, plan.workItemIds) : Promise.resolve([]),
    getTouchedWorkItemIds(ctx.workspaceId, memberId, date),
  ])

  return Response.json({
    memberName: member.name,
    date,
    intention: plan?.intention ?? null,
    updatedAt: plan?.updatedAt ?? null,
    items: linked.map((item) => ({
      id: item.id,
      key: item.key,
      title: item.title,
      status: item.status,
      touched: touched.has(item.id),
    })),
  })
}
