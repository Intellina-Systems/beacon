import 'server-only'

import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { workspaces } from '@/lib/db/schema'

// Allocates the next issue key ("BEA-42") from the workspace's shared counter.
// The atomic UPDATE … RETURNING makes concurrent allocations collision-free;
// the returned counter value is the allocated number.
export async function allocateIssueKey(workspaceId: string): Promise<string> {
  const [row] = await db
    .update(workspaces)
    .set({ issueCounter: sql`${workspaces.issueCounter} + 1`, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning({ counter: workspaces.issueCounter, prefix: workspaces.issuePrefix })
  if (!row) throw new Error('Workspace not found for issue key allocation')
  return `${row.prefix}-${row.counter}`
}

// Unique-violation guard: keys can collide with externally synced items (e.g.
// a Linear issue whose identifier happens to match our prefix). Callers wrap
// the insert and re-allocate on conflict.
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}
