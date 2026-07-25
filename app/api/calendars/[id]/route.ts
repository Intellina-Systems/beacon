import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { calendars } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

type OwnerCheck = { ok: true; isPrimary: boolean } | { ok: false; response: Response }

async function requireOwner(ctx: Awaited<ReturnType<typeof getWorkspaceContext>>, id: string): Promise<OwnerCheck> {
  if (!ctx) return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const [cal] = await db
    .select()
    .from(calendars)
    .where(and(eq(calendars.id, id), eq(calendars.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!cal) return { ok: false, response: Response.json({ error: 'Not found' }, { status: 404 }) }
  if (cal.ownerMemberId !== ctx.member.id)
    return { ok: false, response: Response.json({ error: 'Only the owner can manage this calendar' }, { status: 403 }) }
  return { ok: true, isPrimary: cal.isPrimary }
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  color: z.string().max(20).optional(),
  timezone: z.string().min(1).optional(),
  visibility: z.enum(['private', 'workspace']).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  const { id } = await params
  const check = await requireOwner(ctx, id)
  if (!check.ok) return check.response

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  await db
    .update(calendars)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(calendars.id, id))
  return Response.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  const { id } = await params
  const check = await requireOwner(ctx, id)
  if (!check.ok) return check.response
  if (check.isPrimary) return Response.json({ error: 'Cannot delete your primary calendar' }, { status: 400 })

  await db.delete(calendars).where(eq(calendars.id, id))
  return Response.json({ ok: true })
}
