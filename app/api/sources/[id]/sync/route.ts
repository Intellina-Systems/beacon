import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { signalSources } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { syncSource } from '@/lib/connectors'

export const maxDuration = 300

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const { id } = await params
  const rows = await db
    .select()
    .from(signalSources)
    .where(and(eq(signalSources.id, id), eq(signalSources.workspaceId, ctx.workspaceId)))
    .limit(1)
  const source = rows[0]
  if (!source) return Response.json({ error: 'Not found' }, { status: 404 })

  try {
    const result = await syncSource(ctx.workspaceId, source)
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
