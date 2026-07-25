import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { calendarAccounts } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

// Remove the signed-in member's own calendar connection. Self-scoped: you can
// only disconnect your own calendar.
export async function POST(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  await db
    .delete(calendarAccounts)
    .where(and(eq(calendarAccounts.workspaceId, ctx.workspaceId), eq(calendarAccounts.memberId, ctx.member.id)))

  return Response.json({ success: true })
}
