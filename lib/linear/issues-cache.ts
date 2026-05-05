import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { linearIssueFetchCache } from '@/lib/db/schema'
import { getLinearIssues, type LinearWorkspaceIssue } from '@/lib/linear/client'

const LINEAR_FETCH_CACHE_TTL_MS = 60_000
export const ALL_PROJECT_SCOPE_ID = '__all__'

function readIssuesFromCache(raw: unknown): LinearWorkspaceIssue[] {
  return Array.isArray(raw) ? (raw as LinearWorkspaceIssue[]) : []
}

export async function getCachedLinearIssuesByScope(
  workspaceId: string,
  projectScopeId: string,
  accessToken: string,
): Promise<LinearWorkspaceIssue[]> {
  const now = new Date()

  const [cached] = await db
    .select()
    .from(linearIssueFetchCache)
    .where(
      and(eq(linearIssueFetchCache.workspaceId, workspaceId), eq(linearIssueFetchCache.projectScopeId, projectScopeId)),
    )
    .limit(1)

  if (cached && cached.expiresAt > now) {
    return readIssuesFromCache(cached.issues)
  }

  const issues = await getLinearIssues(
    accessToken,
    projectScopeId === ALL_PROJECT_SCOPE_ID ? undefined : projectScopeId,
  )
  const expiresAt = new Date(now.getTime() + LINEAR_FETCH_CACHE_TTL_MS)

  await db
    .insert(linearIssueFetchCache)
    .values({
      id: nanoid(),
      workspaceId,
      projectScopeId,
      issues,
      fetchedAt: now,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [linearIssueFetchCache.workspaceId, linearIssueFetchCache.projectScopeId],
      set: {
        issues,
        fetchedAt: now,
        expiresAt,
        updatedAt: now,
      },
    })

  return issues
}
