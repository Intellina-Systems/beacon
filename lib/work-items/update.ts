import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import {
  cycles,
  members,
  projects,
  workItems,
  WORK_ITEM_KINDS,
  WORK_ITEM_STATUSES,
  type WorkItem,
} from '@/lib/db/schema'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'
import { canRouteWorkItems, checkWorkItemDelegation } from '@/lib/auth/permissions'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'
import { rankForMove } from './ordering'
import { addWatchers } from './watchers'
import { demoteResolvedBlocks } from './relations'

// The single source of truth for what a work item update may contain — both
// the HTTP route and MCP tools validate against this rather than each
// defining their own field list.
export const patchWorkItemSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    // Generous ceiling: descriptions now carry inline screenshot embeds
    // (`![shot](/api/attachments/<id>)`) alongside the prose.
    description: z.string().max(50000).nullable().optional(),
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

export type PatchWorkItemInput = z.infer<typeof patchWorkItemSchema>

// Thrown for every failure mode — not-found, permission denial, and bad
// input alike (mirrors RelationError's one-class-per-module convention in
// ./relations). `status` lets the HTTP route reproduce its exact current
// status codes without every caller needing to know which check failed; an
// MCP tool can ignore it entirely and just surface `message` to the model.
export class WorkItemUpdateError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function updateWorkItem(
  ctx: WorkspaceContext,
  id: string,
  input: PatchWorkItemInput,
): Promise<{ item: WorkItem }> {
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
      engineId: workItems.engineId,
      teamId: workItems.teamId,
    })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, ctx.workspaceId)))
    .limit(1)
  const existing = existingRows[0]
  if (!existing) throw new WorkItemUpdateError('Not found', 404)

  const { moveAfterId, moveBeforeId, ...fields } = input

  // Org routing (which engine/team owns this) stays an admin/manager call —
  // a lead delegates inside their team rather than moving work across the org.
  const routingChanged =
    (fields.engineId !== undefined && fields.engineId !== existing.engineId) ||
    (fields.teamId !== undefined && fields.teamId !== existing.teamId)
  if (routingChanged && !canRouteWorkItems(ctx)) {
    throw new WorkItemUpdateError('Only an admin or manager can move work between teams or engines', 403)
  }

  const statusChanged = fields.status !== undefined && fields.status !== existing.status
  const assigneeChanged = fields.assigneeMemberId !== undefined && fields.assigneeMemberId !== existing.assigneeMemberId
  const estimateChanged = fields.estimate !== undefined && fields.estimate !== existing.estimate
  const projectChanged = fields.projectId !== undefined && fields.projectId !== existing.projectId

  // Delegation guard: leads may assign within the teams they lead; everyone
  // else may only claim an unassigned item or drop their own.
  if (assigneeChanged) {
    const denied = await checkWorkItemDelegation(
      ctx,
      { teamId: existing.teamId, assigneeMemberId: existing.assigneeMemberId },
      fields.assigneeMemberId ?? null,
    )
    if (denied) throw new WorkItemUpdateError(denied, 403)
  }

  // Validate the new assignee belongs to this workspace
  let newAssignee: { id: string; name: string } | null = null
  if (assigneeChanged && fields.assigneeMemberId) {
    const [row] = await db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(and(eq(members.id, fields.assigneeMemberId), eq(members.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!row) throw new WorkItemUpdateError('Assignee is not a member of this workspace', 400)
    newAssignee = row
  }

  let newProject: { id: string; name: string } | null = null
  if (projectChanged) {
    const [row] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, fields.projectId!), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!row) throw new WorkItemUpdateError('Project not found in this workspace', 400)
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
    if (!row) throw new WorkItemUpdateError('Cycle not found in this project', 400)
    newCycle = row
  }

  // Reorder: compute the new rank from the requested neighbors
  let rank: string | undefined
  if (moveAfterId !== undefined || moveBeforeId !== undefined) {
    try {
      rank = await rankForMove(ctx.workspaceId, moveAfterId ?? null, moveBeforeId ?? null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid move'
      throw new WorkItemUpdateError(message, 400)
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

  return { item }
}
