import 'server-only'

import { db } from '@/lib/db/client'
import { workItems, type WorkItemKind, type WorkItemStatus } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { getDefaultProjectId } from '@/lib/db/projects'
import { ingestEvents } from '@/lib/events/ingest'
import { allocateIssueKey, isUniqueViolation } from '@/lib/work-items/keys'
import { addWatchers } from '@/lib/work-items/watchers'

export interface WorkItemInsertFields {
  kind: WorkItemKind
  title: string
  description?: string
  parentId?: string
  status: WorkItemStatus
  priority: number
  assigneeMemberId?: string
  engineId?: string
  teamId?: string
  labels?: string[]
  dueDate?: Date
  estimate?: number | null
  projectId?: string
}

// Shared by single-item and bulk creation: allocates a collision-safe issue
// key, inserts the row, subscribes the creator/assignee, and emits the
// creation (and assignment) events that drive status/timeline everywhere else.
export async function insertWorkItem(params: {
  workspaceId: string
  creator: { id: string; name: string }
  assignee: { id: string; name: string } | null
  fields: WorkItemInsertFields
  rank: string
}): Promise<typeof workItems.$inferSelect> {
  const { workspaceId, creator, assignee, fields, rank } = params
  const projectId = fields.projectId ?? (await getDefaultProjectId(workspaceId))

  let item: typeof workItems.$inferSelect | undefined
  for (let attempt = 0; attempt < 5 && !item; attempt++) {
    const key = await allocateIssueKey(workspaceId)
    try {
      const inserted = await db
        .insert(workItems)
        .values({
          id: generateId(),
          workspaceId,
          ...fields,
          key,
          projectId,
          rank,
          statusChangedAt: new Date(),
        })
        .returning()
      item = inserted[0]
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
    }
  }
  if (!item) throw new Error('Could not allocate a unique issue key')

  await addWatchers(workspaceId, item.id, [
    { memberId: creator.id, reason: 'creator' },
    ...(assignee ? [{ memberId: assignee.id, reason: 'assigned' as const }] : []),
  ])

  await ingestEvents(
    [
      {
        type: 'task.created',
        source: 'manual',
        summary: `${creator.name} created ${item.key}: ${item.title}`,
        task: item.id,
        engineer: creator.name,
        externalId: `workitem:${item.id}:created`,
      },
      ...(assignee
        ? [
            {
              type: 'task.assigned',
              source: 'manual' as const,
              summary: `${item.key} assigned to ${assignee.name}`,
              task: item.id,
              engineer: assignee.name,
              externalId: `workitem:${item.id}:assigned:${assignee.id}:0`,
              payload: { assigneeMemberId: assignee.id, assignedByMemberId: creator.id },
            },
          ]
        : []),
    ],
    { workspaceId },
  )

  return item
}
