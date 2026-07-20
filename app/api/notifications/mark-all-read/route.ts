import { and, eq, isNull } from 'drizzle-orm'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { db } from '@/lib/db/client'
import { notifications } from '@/lib/db/schema'

export async function POST(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.workspaceId, ctx.workspaceId),
        eq(notifications.memberId, ctx.member.id),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id })

  return Response.json({ marked: updated.length })
}
