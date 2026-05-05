import { and, eq, notInArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { linearIssues, productLinearConnections } from '@/lib/db/schema'
import { getLinearIssues } from '@/lib/linear/client'
import { ALL_PROJECT_SCOPE_ID, getCachedLinearIssuesByScope } from '@/lib/linear/issues-cache'
import { getIssueBucket, type IssueBucket } from '@/lib/linear/issue-bucket'

export interface ProductLinearSyncResult {
  issuesSynced: number
  buckets: Record<IssueBucket, number>
}

function createEmptyBuckets(): Record<IssueBucket, number> {
  return {
    todo: 0,
    inProgress: 0,
    completed: 0,
    backlog: 0,
  }
}

export async function syncProductLinearIssues(
  userId: string,
  productId: string,
  accessToken: string,
): Promise<ProductLinearSyncResult> {
  const connections = await db
    .select()
    .from(productLinearConnections)
    .where(and(eq(productLinearConnections.productId, productId), eq(productLinearConnections.syncEnabled, true)))

  const buckets = createEmptyBuckets()

  if (connections.length === 0) {
    return { issuesSynced: 0, buckets }
  }

  const dedupedByIssueId = new Map<string, Awaited<ReturnType<typeof getLinearIssues>>[number]>()

  for (const connection of connections) {
    const projectScopeId = connection.linearProjectId ?? ALL_PROJECT_SCOPE_ID
    const scopedIssues = await getCachedLinearIssuesByScope(connection.linearWorkspaceId, projectScopeId, accessToken)

    for (const issue of scopedIssues) {
      dedupedByIssueId.set(issue.id, issue)
    }
  }

  const issues = [...dedupedByIssueId.values()]
  const now = new Date()
  const syncedIssueIds: string[] = []

  for (const issue of issues) {
    syncedIssueIds.push(issue.id)

    const dueDate = issue.dueDate ? new Date(issue.dueDate) : null
    const linearCreatedAt = issue.createdAt ? new Date(issue.createdAt) : null
    const linearUpdatedAt = issue.updatedAt ? new Date(issue.updatedAt) : null

    await db
      .insert(linearIssues)
      .values({
        id: nanoid(),
        userId,
        linearIssueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        status: issue.state.name,
        statusType: issue.state.type,
        priority: issue.priority,
        assigneeLinearId: issue.assignee?.id ?? null,
        assigneeName: issue.assignee?.name ?? null,
        linearProjectId: issue.project?.id ?? null,
        projectName: issue.project?.name ?? null,
        linearTeamId: issue.team?.id ?? null,
        teamName: issue.team?.name ?? null,
        linearUrl: issue.url,
        dueDate,
        linearCreatedAt,
        linearUpdatedAt,
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [linearIssues.userId, linearIssues.linearIssueId],
        set: {
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          status: issue.state.name,
          statusType: issue.state.type,
          priority: issue.priority,
          assigneeLinearId: issue.assignee?.id ?? null,
          assigneeName: issue.assignee?.name ?? null,
          linearProjectId: issue.project?.id ?? null,
          projectName: issue.project?.name ?? null,
          linearTeamId: issue.team?.id ?? null,
          teamName: issue.team?.name ?? null,
          linearUrl: issue.url,
          dueDate,
          linearCreatedAt,
          linearUpdatedAt,
          lastSyncedAt: now,
          updatedAt: now,
        },
      })

    buckets[getIssueBucket(issue.state.type, issue.state.name)]++
  }

  if (syncedIssueIds.length > 0) {
    await db
      .delete(linearIssues)
      .where(and(eq(linearIssues.userId, userId), notInArray(linearIssues.linearIssueId, syncedIssueIds)))
  } else {
    await db.delete(linearIssues).where(eq(linearIssues.userId, userId))
  }

  return {
    issuesSynced: issues.length,
    buckets,
  }
}
