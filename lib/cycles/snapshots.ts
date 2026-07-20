import 'server-only'

import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { cycleSnapshots, workItems, type Cycle, type CycleSnapshot } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'

// "Started" = reached in-progress or later (Linear's burnup convention);
// completed is a subset of started, so the burnup's started line always sits
// at or above the completed line.
const STARTED_STATUSES = new Set(['in_progress', 'in_review', 'blocked', 'done'])
const COMPLETED_STATUSES = new Set(['done'])

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

// Computes today's scope/started/completed points from the cycle's current
// membership and upserts one row per day. Unestimated items count as 1 point
// so charts work without mandatory estimation. Idempotent — safe to call
// more than once on the same day (e.g. once from the daily cron, once more
// from rollover) since each call reflects current truth, not a delta.
export async function snapshotCycle(cycle: Cycle, at: Date = new Date()): Promise<CycleSnapshot> {
  const items = await db
    .select({ status: workItems.status, estimate: workItems.estimate })
    .from(workItems)
    .where(eq(workItems.cycleId, cycle.id))

  let scopePoints = 0
  let startedPoints = 0
  let completedPoints = 0
  for (const item of items) {
    const points = item.estimate ?? 1
    scopePoints += points
    if (STARTED_STATUSES.has(item.status)) startedPoints += points
    if (COMPLETED_STATUSES.has(item.status)) completedPoints += points
  }

  const [snapshot] = await db
    .insert(cycleSnapshots)
    .values({
      id: generateId(),
      cycleId: cycle.id,
      workspaceId: cycle.workspaceId,
      snapshotDate: dateKey(at),
      scopePoints,
      startedPoints,
      completedPoints,
      itemCount: items.length,
    })
    .onConflictDoUpdate({
      target: [cycleSnapshots.cycleId, cycleSnapshots.snapshotDate],
      set: { scopePoints, startedPoints, completedPoints, itemCount: items.length },
    })
    .returning()

  return snapshot
}

export async function listSnapshots(cycleId: string): Promise<CycleSnapshot[]> {
  return db
    .select()
    .from(cycleSnapshots)
    .where(eq(cycleSnapshots.cycleId, cycleId))
    .orderBy(asc(cycleSnapshots.snapshotDate))
}
