import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { workItems, WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ingestEvents } from '@/lib/events/ingest'

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10000).nullable().optional(),
  kind: z.enum(WORK_ITEM_KINDS).optional(),
  status: z.enum(WORK_ITEM_STATUSES).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  assigneeMemberId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  labels: z.array(z.string()).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid update', issues: parsed.error.issues }, { status: 400 })
  }

  const { id } = await params
  const existingRows = await db
    .select({ id: workItems.id, status: workItems.status, key: workItems.key, title: workItems.title })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, ctx.workspaceId)))
    .limit(1)
  const existing = existingRows[0]
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  const statusChanged = parsed.data.status && parsed.data.status !== existing.status

  const [item] = await db
    .update(workItems)
    .set({
      ...parsed.data,
      ...(statusChanged ? { statusChangedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(workItems.id, id))
    .returning()

  if (statusChanged) {
    await ingestEvents(
      [
        {
          type: 'task.status_changed',
          source: 'manual',
          summary: `${existing.key ?? existing.title} moved to ${parsed.data.status!.replace('_', ' ')}`,
          task: id,
          payload: { status: parsed.data.status, previousStatus: existing.status },
        },
      ],
      { workspaceId: ctx.workspaceId },
    )
  }

  return Response.json({ item })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [deleted] = await db
    .delete(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, ctx.workspaceId)))
    .returning({ id: workItems.id })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
