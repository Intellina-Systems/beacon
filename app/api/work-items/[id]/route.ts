import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { members, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ingestEvents } from '@/lib/events/ingest'
import { listEvents } from '@/lib/events/queries'
import { patchWorkItemSchema, updateWorkItem, WorkItemUpdateError } from '@/lib/work-items/update'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await db
    .select({
      id: workItems.id,
      parentId: workItems.parentId,
      kind: workItems.kind,
      key: workItems.key,
      title: workItems.title,
      description: workItems.description,
      status: workItems.status,
      priority: workItems.priority,
      assigneeMemberId: workItems.assigneeMemberId,
      assigneeName: members.name,
      labels: workItems.labels,
      dueDate: workItems.dueDate,
      rank: workItems.rank,
      estimate: workItems.estimate,
      snoozedUntil: workItems.snoozedUntil,
      externalProvider: workItems.externalProvider,
      externalUrl: workItems.externalUrl,
      projectId: workItems.projectId,
      engineId: workItems.engineId,
      teamId: workItems.teamId,
      lastEventAt: workItems.lastEventAt,
      createdAt: workItems.createdAt,
      updatedAt: workItems.updatedAt,
    })
    .from(workItems)
    .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, ctx.workspaceId)))
    .limit(1)

  if (!rows[0]) return Response.json({ error: 'Not found' }, { status: 404 })

  // The item's own event history — the real, derived activity feed.
  const events = await listEvents(ctx.workspaceId, { workItemId: id, limit: 40 })
  return Response.json({ item: rows[0], events })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchWorkItemSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid update', issues: parsed.error.issues }, { status: 400 })
  }

  const { id } = await params
  try {
    const { item } = await updateWorkItem(ctx, id, parsed.data)
    return Response.json({ item })
  } catch (error) {
    if (error instanceof WorkItemUpdateError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [deleted] = await db
    .delete(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, ctx.workspaceId)))
    .returning({ id: workItems.id, key: workItems.key, title: workItems.title })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })

  await ingestEvents(
    [
      {
        type: 'task.cancelled',
        source: 'manual',
        summary: `${deleted.key ?? deleted.title} deleted by ${ctx.member.name}`,
        engineer: ctx.member.name,
        externalId: `workitem:${deleted.id}:deleted`,
      },
    ],
    { workspaceId: ctx.workspaceId },
  )

  return Response.json({ success: true })
}
