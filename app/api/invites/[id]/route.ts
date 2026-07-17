import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { invites } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const { id } = await params
  const [revoked] = await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, id), eq(invites.workspaceId, ctx.workspaceId), isNull(invites.acceptedAt)))
    .returning({ id: invites.id })

  if (!revoked) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
