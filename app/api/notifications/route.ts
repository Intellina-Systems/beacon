import { and, count, desc, eq, isNull, or, lte, type SQL } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { events, notifications, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

// The signed-in member's inbox: one row per event on a work item they watch,
// excluding events they caused themselves (filtered at fan-out time).
export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const filter = params.get('filter') ?? 'active' // active (unread, unsnoozed) | unread | all
  const limit = Math.min(Number(params.get('limit') ?? 50) || 50, 200)
  const offset = Math.max(Number(params.get('offset') ?? 0) || 0, 0)

  const conditions: (SQL | undefined)[] = [
    eq(notifications.workspaceId, ctx.workspaceId),
    eq(notifications.memberId, ctx.member.id),
  ]
  if (filter === 'unread') {
    conditions.push(isNull(notifications.readAt))
  } else if (filter === 'active') {
    conditions.push(isNull(notifications.readAt))
    conditions.push(or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, new Date())))
  }

  const [rows, unreadCountRow] = await Promise.all([
    db
      .select({
        id: notifications.id,
        readAt: notifications.readAt,
        snoozedUntil: notifications.snoozedUntil,
        createdAt: notifications.createdAt,
        eventType: events.type,
        eventSource: events.source,
        eventSummary: events.summary,
        actorLabel: events.actorLabel,
        occurredAt: events.occurredAt,
        workItemId: workItems.id,
        workItemKey: workItems.key,
        workItemTitle: workItems.title,
      })
      .from(notifications)
      .innerJoin(events, eq(events.id, notifications.eventId))
      .leftJoin(workItems, eq(workItems.id, notifications.workItemId))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, ctx.workspaceId),
          eq(notifications.memberId, ctx.member.id),
          isNull(notifications.readAt),
        ),
      ),
  ])

  return Response.json({ notifications: rows, unreadCount: unreadCountRow[0]?.value ?? 0 })
}
