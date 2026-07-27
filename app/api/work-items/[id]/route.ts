import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { cycles, members, projects, workItems, WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'
import { listEvents } from '@/lib/events/queries'
import { rankForMove } from '@/lib/work-items/ordering'
import { addWatchers } from '@/lib/work-items/watchers'
import { demoteResolvedBlocks } from '@/lib/work-items/relations'

const patchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(10000).nullable().optional(),
    kind: z.enum(WORK_ITEM_KINDS).optional(),
    status: z.enum(WORK_ITEM_STATUSES).optional(),
    priority: z.number().int().min(0).max(4).optional(),
    assigneeMemberId: z.string().nullable().optional(),
    projectId: z.string().optional(),
    parentId: z.string().nullable().optional(),
    labels: z.array(z.string()).max(20).nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    estimate: z.number().min(0).max(1000).nullable().optional(),
    cycleId: z.string().nullable().optional(),
    engineId: z.string().nullable().optional(),
    teamId: z.string().nullable().optional(),
    // Manual reorder: place this item after/before these items (either or both)
    moveAfterId: z.string().nullable().optional(),
    moveBeforeId: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Empty update' })

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

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid update', issues: parsed.error.issues }, { status: 400 })
  }

  const { id } = await params
  const existingRows = await db
    .select({
      id: workItems.id,
      status: workItems.status,
      key: workItems.key,
      title: workItems.title,
      projectId: workItems.projectId,
      assigneeMemberId: workItems.assigneeMemberId,
      estimate: workItems.estimate,
      cycleId: workItems.cycleId,
    })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, ctx.workspaceId)))
    .limit(1)
  const existing = existingRows[0]
  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  const { moveAfterId, moveBeforeId, ...fields } = parsed.data

  const statusChanged = fields.status !== undefined && fields.status !== existing.status
  const assigneeChanged = fields.assigneeMemberId !== undefined && fields.assigneeMemberId !== existing.assigneeMemberId
  const estimateChanged = fields.estimate !== undefined && fields.estimate !== existing.estimate
  const projectChanged = fields.projectId !== undefined && fields.projectId !== existing.projectId

  // Validate the new assignee belongs to this workspace
  let newAssignee: { id: string; name: string } | null = null
  if (assigneeChanged && fields.assigneeMemberId) {
    const [row] = await db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(and(eq(members.id, fields.assigneeMemberId), eq(members.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!row) return Response.json({ error: 'Assignee is not a member of this workspace' }, { status: 400 })
    newAssignee = row
  }

  let newProject: { id: string; name: string } | null = null
  if (projectChanged) {
    const [row] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, fields.projectId!), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!row) return Response.json({ error: 'Project not found in this workspace' }, { status: 400 })
    newProject = row
    // A cycle only ever holds items from its own project — moving projects
    // without an explicit cycle drops the now-mismatched one.
    if (fields.cycleId === undefined && existing.cycleId) fields.cycleId = null
  }

  const cycleChanged = fields.cycleId !== undefined && fields.cycleId !== existing.cycleId

  // A cycle only ever holds items from its own project
  let newCycle: { id: string; number: number } | null = null
  if (cycleChanged && fields.cycleId) {
    const [row] = await db
      .select({ id: cycles.id, number: cycles.number })
      .from(cycles)
      .where(
        and(
          eq(cycles.id, fields.cycleId),
          eq(cycles.workspaceId, ctx.workspaceId),
          eq(cycles.projectId, newProject?.id ?? existing.projectId),
        ),
      )
      .limit(1)
    if (!row) return Response.json({ error: 'Cycle not found in this project' }, { status: 400 })
    newCycle = row
  }

  // Reorder: compute the new rank from the requested neighbors
  let rank: string | undefined
  if (moveAfterId !== undefined || moveBeforeId !== undefined) {
    try {
      rank = await rankForMove(ctx.workspaceId, moveAfterId ?? null, moveBeforeId ?? null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid move'
      return Response.json({ error: message }, { status: 400 })
    }
  }

  const [item] = await db
    .update(workItems)
    .set({
      ...fields,
      ...(rank !== undefined ? { rank } : {}),
      ...(statusChanged ? { statusChangedAt: new Date() } : {}),
      // Leaving triage (by any status change) clears the triage snooze
      ...(statusChanged && existing.status === 'triage' ? { snoozedUntil: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(workItems.id, id))
    .returning()

  // New assignee starts watching before events fan out, so their inbox
  // receives the assignment notification chain from here on.
  if (newAssignee) {
    await addWatchers(ctx.workspaceId, id, [{ memberId: newAssignee.id, reason: 'assigned' }])
  }

  const label = existing.key ?? existing.title
  const eventsToEmit: RawEvent[] = []
  if (statusChanged) {
    eventsToEmit.push({
      type: 'task.status_changed',
      source: 'manual',
      summary: `${label} moved to ${fields.status!.replace('_', ' ')} by ${ctx.member.name}`,
      task: id,
      engineer: ctx.member.name,
      payload: { status: fields.status, previousStatus: existing.status },
    })
  }
  if (assigneeChanged) {
    eventsToEmit.push({
      type: 'task.assigned',
      source: 'manual',
      summary: newAssignee ? `${label} assigned to ${newAssignee.name}` : `${label} unassigned`,
      task: id,
      engineer: newAssignee?.name ?? ctx.member.name,
      payload: {
        assigneeMemberId: newAssignee?.id ?? null,
        previousAssigneeMemberId: existing.assigneeMemberId,
        assignedByMemberId: ctx.member.id,
      },
    })
  }
  if (estimateChanged) {
    eventsToEmit.push({
      type: 'task.updated',
      source: 'manual',
      summary: `${label} estimate set to ${fields.estimate ?? 'none'}`,
      task: id,
      engineer: ctx.member.name,
      payload: { field: 'estimate', estimate: fields.estimate ?? null, previousEstimate: existing.estimate },
    })
  }
  if (projectChanged && newProject) {
    eventsToEmit.push({
      type: 'task.updated',
      source: 'manual',
      summary: `${label} moved to project ${newProject.name} by ${ctx.member.name}`,
      task: id,
      engineer: ctx.member.name,
      payload: { field: 'projectId', projectId: newProject.id, previousProjectId: existing.projectId },
    })
  }
  if (cycleChanged) {
    if (existing.cycleId) {
      eventsToEmit.push({
        type: 'sprint.item_removed',
        source: 'manual',
        summary: `${label} removed from cycle by ${ctx.member.name}`,
        task: id,
        engineer: ctx.member.name,
        payload: { cycleId: existing.cycleId, reason: 'manual' },
      })
    }
    if (newCycle) {
      eventsToEmit.push({
        type: 'sprint.item_added',
        source: 'manual',
        summary: `${label} added to cycle ${newCycle.number} by ${ctx.member.name}`,
        task: id,
        engineer: ctx.member.name,
        payload: { cycleId: newCycle.id, reason: 'manual' },
      })
    }
  }
  if (eventsToEmit.length > 0) {
    await ingestEvents(eventsToEmit, { workspaceId: ctx.workspaceId })
  }

  // Resolving an item demotes any "blocks" relations it holds to "related" —
  // it can no longer be an active blocker once it's done or cancelled.
  if (statusChanged && (fields.status === 'done' || fields.status === 'cancelled')) {
    await demoteResolvedBlocks(ctx.workspaceId, id)
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
