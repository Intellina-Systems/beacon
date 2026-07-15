import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { apiKeys } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [revoked] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, session.user.id)))
    .returning({ id: apiKeys.id })

  if (!revoked) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
