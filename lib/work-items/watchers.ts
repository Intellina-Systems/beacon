import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, workItemWatchers, type WatcherReason } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'

export interface WatcherEntry {
  memberId: string
  reason: WatcherReason
}

// Subscribe members to a work item. Existing subscriptions are left untouched
// (first reason wins), so auto-subscribing an existing manual watcher is a no-op.
export async function addWatchers(workspaceId: string, workItemId: string, entries: WatcherEntry[]): Promise<void> {
  const unique = new Map(entries.map((entry) => [entry.memberId, entry]))
  if (unique.size === 0) return
  await db
    .insert(workItemWatchers)
    .values(
      Array.from(unique.values()).map((entry) => ({
        id: generateId(),
        workspaceId,
        workItemId,
        memberId: entry.memberId,
        reason: entry.reason,
      })),
    )
    .onConflictDoNothing({ target: [workItemWatchers.workItemId, workItemWatchers.memberId] })
}

export async function removeWatcher(workItemId: string, memberId: string): Promise<boolean> {
  const deleted = await db
    .delete(workItemWatchers)
    .where(and(eq(workItemWatchers.workItemId, workItemId), eq(workItemWatchers.memberId, memberId)))
    .returning({ id: workItemWatchers.id })
  return deleted.length > 0
}

export async function listWatchers(workItemId: string) {
  return db
    .select({
      memberId: workItemWatchers.memberId,
      reason: workItemWatchers.reason,
      name: members.name,
      avatarUrl: members.avatarUrl,
    })
    .from(workItemWatchers)
    .innerJoin(members, eq(members.id, workItemWatchers.memberId))
    .where(eq(workItemWatchers.workItemId, workItemId))
    .orderBy(workItemWatchers.createdAt)
}
