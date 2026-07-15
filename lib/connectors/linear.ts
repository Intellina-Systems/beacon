import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { connections, members, signalSources, workItems, type SignalSource, type WorkItemStatus } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { getLinearIssues, type LinearIssue } from '@/lib/linear/client'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'
import { generateId } from '@/lib/utils/id'
import type { SyncResult } from './types'

const STATE_TYPE_TO_STATUS: Record<string, WorkItemStatus> = {
  triage: 'backlog',
  backlog: 'backlog',
  unstarted: 'todo',
  started: 'in_progress',
  completed: 'done',
  cancelled: 'cancelled',
}

function mapStatus(issue: LinearIssue): WorkItemStatus {
  return STATE_TYPE_TO_STATUS[issue.state.type] ?? 'todo'
}

// Mirror a Linear project/team/workspace into the work graph and emit events
// for anything that changed since the last sync.
export async function syncLinearSource(userId: string, source: SignalSource): Promise<SyncResult> {
  const connectionRows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.provider, 'linear')))
    .limit(1)
  const connection = connectionRows[0]
  if (!connection) throw new Error('Linear is not connected')

  const accessToken = decrypt(connection.accessToken)
  const cursor = (source.cursor ?? {}) as { updatedSince?: string }
  const updatedSince = cursor.updatedSince ? new Date(cursor.updatedSince) : undefined

  const issues = await getLinearIssues(accessToken, {
    projectId: source.kind === 'linear_project' ? source.identifier : undefined,
    teamId: source.kind === 'linear_team' ? source.identifier : undefined,
    updatedSince,
  })

  if (issues.length === 0) return { events: 0, workItems: 0 }

  const existingRows = await db
    .select({ id: workItems.id, externalId: workItems.externalId, status: workItems.status, key: workItems.key })
    .from(workItems)
    .where(and(eq(workItems.userId, userId), eq(workItems.externalProvider, 'linear')))
  const existingByExternalId = new Map(existingRows.map((row) => [row.externalId, row]))

  const roster = await db.select().from(members).where(eq(members.userId, userId))
  const memberByLinearId = new Map(roster.filter((m) => m.linearUserId).map((m) => [m.linearUserId, m]))

  const rawEvents: RawEvent[] = []
  let upserted = 0
  const now = new Date()

  for (const issue of issues) {
    const status = mapStatus(issue)
    const existing = existingByExternalId.get(issue.id)
    const assignee = issue.assignee ? memberByLinearId.get(issue.assignee.id) : undefined

    const values = {
      userId,
      kind: 'task' as const,
      key: issue.identifier,
      title: issue.title,
      description: issue.description,
      status,
      priority: issue.priority,
      assigneeMemberId: assignee?.id ?? null,
      dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
      externalProvider: 'linear',
      externalId: issue.id,
      externalUrl: issue.url,
      updatedAt: now,
    }

    if (!existing) {
      await db
        .insert(workItems)
        .values({ ...values, id: generateId(), statusChangedAt: new Date(issue.updatedAt) })
        .onConflictDoUpdate({
          target: [workItems.userId, workItems.externalProvider, workItems.externalId],
          set: values,
        })
      upserted++
      rawEvents.push({
        type: 'task.created',
        source: 'linear',
        summary: `${issue.identifier} created: ${issue.title}`,
        task: issue.identifier,
        engineer: issue.assignee?.name,
        externalId: `linear:${issue.id}:created`,
        occurredAt: new Date(issue.createdAt),
        payload: { status, url: issue.url, project: issue.project?.name, team: issue.team?.name },
      })
      // If the issue arrives already past "todo", record where it stands
      if (status !== 'todo' && status !== 'backlog') {
        rawEvents.push({
          type: 'task.status_changed',
          source: 'linear',
          summary: `${issue.identifier} is ${status.replace('_', ' ')}: ${issue.title}`,
          task: issue.identifier,
          engineer: issue.assignee?.name,
          externalId: `linear:${issue.id}:status:${status}`,
          occurredAt: new Date(issue.updatedAt),
          payload: { status, previousStatus: null },
        })
      }
    } else {
      await db
        .update(workItems)
        .set(existing.status === status ? values : { ...values, statusChangedAt: new Date(issue.updatedAt) })
        .where(eq(workItems.id, existing.id))
      upserted++
      if (existing.status !== status) {
        rawEvents.push({
          type: 'task.status_changed',
          source: 'linear',
          summary: `${issue.identifier} moved to ${status.replace('_', ' ')}: ${issue.title}`,
          task: issue.identifier,
          engineer: issue.assignee?.name,
          externalId: `linear:${issue.id}:status:${status}:${issue.updatedAt}`,
          occurredAt: new Date(issue.updatedAt),
          payload: { status, previousStatus: existing.status },
        })
      }
    }
  }

  const result = await ingestEvents(rawEvents, { userId, defaultSource: 'linear' })

  const latestUpdatedAt = issues.reduce((max, issue) => (issue.updatedAt > max ? issue.updatedAt : max), '')
  await db
    .update(signalSources)
    .set({
      cursor: { updatedSince: latestUpdatedAt || new Date().toISOString() },
      lastSyncedAt: now,
      lastSyncError: null,
      updatedAt: now,
    })
    .where(eq(signalSources.id, source.id))

  return { events: result.inserted, workItems: upserted }
}
