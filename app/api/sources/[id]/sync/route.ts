import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { signalSources } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { syncSource } from '@/lib/connectors'

export const maxDuration = 300

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await db
    .select()
    .from(signalSources)
    .where(and(eq(signalSources.id, id), eq(signalSources.userId, session.user.id)))
    .limit(1)
  const source = rows[0]
  if (!source) return Response.json({ error: 'Not found' }, { status: 404 })

  try {
    const result = await syncSource(session.user.id, source)
    return Response.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    await db
      .update(signalSources)
      .set({ lastSyncError: message, updatedAt: new Date() })
      .where(eq(signalSources.id, source.id))
    return Response.json({ error: message }, { status: 502 })
  }
}
