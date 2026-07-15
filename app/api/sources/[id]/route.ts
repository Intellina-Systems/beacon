import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { signalSources } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'

const patchSchema = z.object({ enabled: z.boolean() })

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const { id } = await params
  const [updated] = await db
    .update(signalSources)
    .set({ enabled: parsed.data.enabled, updatedAt: new Date() })
    .where(and(eq(signalSources.id, id), eq(signalSources.userId, session.user.id)))
    .returning()

  if (!updated) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ source: updated })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [deleted] = await db
    .delete(signalSources)
    .where(and(eq(signalSources.id, id), eq(signalSources.userId, session.user.id)))
    .returning({ id: signalSources.id })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
