import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { calendarAccounts } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { syncCalendarAccount } from '@/lib/connectors'

// Manual "Sync now" for the signed-in member's own calendar.
export async function POST(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [account] = await db
    .select()
    .from(calendarAccounts)
    .where(and(eq(calendarAccounts.workspaceId, ctx.workspaceId), eq(calendarAccounts.memberId, ctx.member.id)))
    .limit(1)

  if (!account) return Response.json({ error: 'No calendar connected' }, { status: 404 })

  try {
    const result = await syncCalendarAccount(account)
    return Response.json({ success: true, events: result.events })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    console.error('[calendar sync] manual sync failed:', message)
    return Response.json({ error: 'Sync failed' }, { status: 502 })
  }
}
