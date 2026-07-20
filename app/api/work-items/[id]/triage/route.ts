import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { workItems, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ingestEvents } from '@/lib/events/ingest'

const triageSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept'), status: z.enum(WORK_ITEM_STATUSES).optional() }),
  z.object({ action: z.literal('decline') }),
  z.object({ action: z.literal('snooze'), until: z.coerce.date() }),
])

// Triage queue actions — accept/decline/snooze. Marking as a duplicate is a
// relation (POST .../relations with type "duplicate"), which already cancels
// the item and merges its watchers into the canonical one.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = triageSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid triage action', issues: parsed.error.issues }, { status: 400 })
  }

  const { id } = await params
  const [existing] = await db
    .select({ id: workItems.id, status: workItems.status, key: workItems.key, title: workItems.title })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  const label = existing.key ?? existing.title
  const action = parsed.data.action

  if (action === 'snooze') {
    if (existing.status !== 'triage') {
      return Response.json({ error: 'Only items in triage can be snoozed' }, { status: 400 })
    }
    const [item] = await db
      .update(workItems)
      .set({ snoozedUntil: parsed.data.until, updatedAt: new Date() })
      .where(eq(workItems.id, id))
      .returning()
    await ingestEvents(
      [
        {
          type: 'task.updated',
          source: 'manual',
          summary: `${label} snoozed until ${parsed.data.until.toISOString()} by ${ctx.member.name}`,
          task: id,
          engineer: ctx.member.name,
          payload: { field: 'snoozedUntil', snoozedUntil: parsed.data.until.toISOString() },
        },
      ],
      { workspaceId: ctx.workspaceId },
    )
    return Response.json({ item })
  }

  if (existing.status !== 'triage') {
    return Response.json({ error: 'Only items in triage can be accepted or declined' }, { status: 400 })
  }

  const nextStatus = action === 'accept' ? (parsed.data.status ?? 'todo') : 'cancelled'
  const now = new Date()
  const [item] = await db
    .update(workItems)
    .set({ status: nextStatus, statusChangedAt: now, snoozedUntil: null, updatedAt: now })
    .where(eq(workItems.id, id))
    .returning()

  await ingestEvents(
    [
      {
        type: 'task.status_changed',
        source: 'manual',
        summary:
          action === 'accept'
            ? `${label} accepted from triage by ${ctx.member.name}`
            : `${label} declined from triage by ${ctx.member.name}`,
        task: id,
        engineer: ctx.member.name,
        payload: { status: nextStatus, previousStatus: 'triage', triageAction: action },
      },
    ],
    { workspaceId: ctx.workspaceId },
  )

  return Response.json({ item })
}
