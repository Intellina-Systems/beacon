import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { views, VIEW_LAYOUTS, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { isAdmin } from '@/lib/auth/permissions'

const filtersSchema = z.object({
  statuses: z.array(z.enum(WORK_ITEM_STATUSES)).optional(),
  projectId: z.string().optional(),
  assignee: z.string().optional(),
  cycleId: z.string().optional(),
})

const patchSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    layout: z.enum(VIEW_LAYOUTS).optional(),
    filters: filtersSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Empty update' })

async function assertOwnerOrAdmin(viewId: string, workspaceId: string, memberId: string, admin: boolean) {
  const [view] = await db
    .select({ id: views.id, createdByMemberId: views.createdByMemberId })
    .from(views)
    .where(and(eq(views.id, viewId), eq(views.workspaceId, workspaceId)))
    .limit(1)
  if (!view) return { ok: false as const, status: 404, error: 'Not found' }
  if (!admin && view.createdByMemberId !== memberId) return { ok: false as const, status: 403, error: 'Forbidden' }
  return { ok: true as const }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid update', issues: parsed.error.issues }, { status: 400 })

  const { id } = await params
  const check = await assertOwnerOrAdmin(id, ctx.workspaceId, ctx.member.id, isAdmin(ctx))
  if (!check.ok) return Response.json({ error: check.error }, { status: check.status })

  const [view] = await db
    .update(views)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(views.id, id))
    .returning()

  return Response.json({ view })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const check = await assertOwnerOrAdmin(id, ctx.workspaceId, ctx.member.id, isAdmin(ctx))
  if (!check.ok) return Response.json({ error: check.error }, { status: check.status })

  await db.delete(views).where(eq(views.id, id))
  return Response.json({ success: true })
}
