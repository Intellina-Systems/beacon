import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { engines } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { canManageOrgUnit } from '@/lib/org/access'

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  ownerMemberId: z.string().nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [existing] = await db
    .select({ id: engines.id, ownerMemberId: engines.ownerMemberId })
    .from(engines)
    .where(and(eq(engines.id, id), eq(engines.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })
  if (!canManageOrgUnit(ctx, existing)) return forbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  // Reassigning the Lead is Admin-only — a Lead managing their own group
  // shouldn't be able to hand it off (or accidentally lock themselves out).
  if ('ownerMemberId' in parsed.data && !isAdmin(ctx)) {
    return Response.json({ error: 'Only an admin can reassign the Lead' }, { status: 403 })
  }

  const [updated] = await db
    .update(engines)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(engines.id, id), eq(engines.workspaceId, ctx.workspaceId)))
    .returning()

  if (!updated) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ engine: updated })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const { id } = await params
  const [deleted] = await db
    .delete(engines)
    .where(and(eq(engines.id, id), eq(engines.workspaceId, ctx.workspaceId)))
    .returning({ id: engines.id })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
