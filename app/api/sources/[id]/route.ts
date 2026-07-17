import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { signalSources } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const { id } = await params
  const [updated] = await db
    .update(signalSources)
    .set({
      ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
      ...(parsed.data.projectId !== undefined && { projectId: parsed.data.projectId }),
      updatedAt: new Date(),
    })
    .where(and(eq(signalSources.id, id), eq(signalSources.workspaceId, ctx.workspaceId)))
    .returning()

  if (!updated) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ source: updated })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const { id } = await params
  const [deleted] = await db
    .delete(signalSources)
    .where(and(eq(signalSources.id, id), eq(signalSources.workspaceId, ctx.workspaceId)))
    .returning({ id: signalSources.id })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
