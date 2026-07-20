import 'server-only'

import { and, asc, desc, eq, inArray, isNull, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { workItems } from '@/lib/db/schema'
import { rankAfter, rankBetween } from './rank'

// Highest rank currently in the workspace (null if nothing is ranked yet).
export async function maxRank(workspaceId: string): Promise<string | null> {
  const [row] = await db
    .select({ rank: workItems.rank })
    .from(workItems)
    .where(and(eq(workItems.workspaceId, workspaceId), isNotNull(workItems.rank)))
    .orderBy(desc(workItems.rank))
    .limit(1)
  return row?.rank ?? null
}

// Self-healing backfill: items created before ranks existed (or synced in from
// connectors) have rank = null and sort by createdAt. Before a manual reorder
// can reference them as neighbors, give every unranked item a rank appended
// after the current maximum, preserving their createdAt order.
export async function ensureRanks(workspaceId: string): Promise<void> {
  const unranked = await db
    .select({ id: workItems.id })
    .from(workItems)
    .where(and(eq(workItems.workspaceId, workspaceId), isNull(workItems.rank)))
    .orderBy(asc(workItems.createdAt))
  if (unranked.length === 0) return

  let last = await maxRank(workspaceId)
  for (const item of unranked) {
    last = rankAfter(last)
    await db.update(workItems).set({ rank: last }).where(eq(workItems.id, item.id))
  }
}

// Compute the rank for placing an item between two neighbors (either may be
// absent: after-only = drop at end of that gap, before-only = drop at start).
export async function rankForMove(
  workspaceId: string,
  moveAfterId: string | null,
  moveBeforeId: string | null,
): Promise<string> {
  await ensureRanks(workspaceId)

  const neighborIds = [moveAfterId, moveBeforeId].filter((id): id is string => !!id)
  const neighbors = neighborIds.length
    ? await db
        .select({ id: workItems.id, rank: workItems.rank })
        .from(workItems)
        .where(and(eq(workItems.workspaceId, workspaceId), inArray(workItems.id, neighborIds)))
    : []
  const rankOf = new Map(neighbors.map((n) => [n.id, n.rank]))

  if (moveAfterId && !rankOf.has(moveAfterId)) {
    throw new Error('moveAfterId does not reference a work item in this workspace')
  }
  if (moveBeforeId && !rankOf.has(moveBeforeId)) {
    throw new Error('moveBeforeId does not reference a work item in this workspace')
  }

  // ensureRanks ran above, so any existing neighbor has a rank by now.
  const afterRank = moveAfterId ? (rankOf.get(moveAfterId) ?? null) : null
  const beforeRank = moveBeforeId ? (rankOf.get(moveBeforeId) ?? null) : null

  return rankBetween(afterRank, beforeRank)
}
