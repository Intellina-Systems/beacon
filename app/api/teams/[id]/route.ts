import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { teams, TEAM_KINDS } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { canManageTeam } from '@/lib/org/access'

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  kind: z.enum(TEAM_KINDS).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const { id } = await params
  // A team's Lead can rename and re-describe their own team; DELETE below
  // stays Admin-only.
  if (!(await canManageTeam(ctx, id))) return forbidden()
  const [updated] = await db
    .update(teams)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(teams.id, id), eq(teams.workspaceId, ctx.workspaceId)))
    .returning()

  if (!updated) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ team: updated })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const { id } = await params
  const [deleted] = await db
    .delete(teams)
    .where(and(eq(teams.id, id), eq(teams.workspaceId, ctx.workspaceId)))
    .returning({ id: teams.id })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
