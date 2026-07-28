import { type NextRequest } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { members, WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canRouteWorkItems, checkWorkItemDelegation, forbidden } from '@/lib/auth/permissions'
import { rankAfter } from '@/lib/work-items/rank'
import { maxRank } from '@/lib/work-items/ordering'
import { insertWorkItem } from '@/lib/work-items/create'

const itemSchema = z.object({
  kind: z.enum(WORK_ITEM_KINDS).default('task'),
  projectId: z.string().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional(),
  status: z.enum(WORK_ITEM_STATUSES).default('todo'),
  priority: z.number().int().min(0).max(4).default(0),
  assigneeMemberId: z.string().optional(),
  engineId: z.string().optional(),
  teamId: z.string().optional(),
  labels: z.array(z.string()).max(20).optional(),
  dueDate: z.coerce.date().optional(),
  estimate: z.number().min(0).max(1000).nullable().optional(),
})

const requestSchema = z.object({ items: z.array(itemSchema).min(1).max(50) })

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid work items', issues: parsed.error.issues }, { status: 400 })
  }

  // Same guards as PATCH, so bulk create can't be used to route work across
  // the org or hand it to someone outside the teams you lead.
  if (!canRouteWorkItems(ctx)) {
    if (parsed.data.items.some((i) => i.engineId || i.teamId)) {
      return forbidden('Only an admin or manager can file work against a team or engine')
    }
    for (const item of parsed.data.items) {
      const denied = await checkWorkItemDelegation(
        ctx,
        { teamId: item.teamId ?? null, assigneeMemberId: null },
        item.assigneeMemberId ?? null,
      )
      if (denied) return forbidden(denied)
    }
  }

  // Validate every assignee up front so a bad id fails the whole batch
  // instead of silently creating some items unassigned.
  const assigneeIds = [...new Set(parsed.data.items.map((i) => i.assigneeMemberId).filter((id): id is string => !!id))]
  const validMembers = assigneeIds.length
    ? await db
        .select({ id: members.id, name: members.name })
        .from(members)
        .where(and(eq(members.workspaceId, ctx.workspaceId), inArray(members.id, assigneeIds)))
    : []
  const memberById = new Map(validMembers.map((m) => [m.id, m]))
  for (const id of assigneeIds) {
    if (!memberById.has(id)) {
      return Response.json({ error: 'Assignee is not a member of this workspace' }, { status: 400 })
    }
  }

  let rank = await maxRank(ctx.workspaceId)
  const created = []
  for (const item of parsed.data.items) {
    rank = rankAfter(rank)
    const assignee = item.assigneeMemberId ? (memberById.get(item.assigneeMemberId) ?? null) : null
    const inserted = await insertWorkItem({
      workspaceId: ctx.workspaceId,
      creator: { id: ctx.member.id, name: ctx.member.name },
      assignee,
      fields: item,
      rank,
    })
    created.push(inserted)
  }

  return Response.json({ items: created }, { status: 201 })
}
