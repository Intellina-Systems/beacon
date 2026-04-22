import { and, eq, notInArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { linearIssues } from '@/lib/db/schema'
import { getLinearIssues } from '@/lib/linear/client'
import { getIssueBucket, type IssueBucket } from '@/lib/linear/issue-bucket'

export interface LinearIssuesSyncResult {
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

export async function syncLinearIssuesForUser(userId: string, accessToken: string): Promise<LinearIssuesSyncResult> {
  const issues = await getLinearIssues(accessToken)
  const now = new Date()
  const syncedIssueIds: string[] = []
  const buckets = createEmptyBuckets()

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
