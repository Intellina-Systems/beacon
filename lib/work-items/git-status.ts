import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { events } from '@/lib/db/schema'

// Given a work item that just had a PR merge recorded, decides whether every
// PR ever linked to it with a closing keyword ("fixes/closes/resolves…") has
// now been merged or closed — the "last linked PR wins" rule: an item with
// two closing PRs doesn't complete until both are gone. An item referenced
// only non-closingly, or with no closing PR at all, is never auto-completed.
export async function allClosingPRsResolved(workspaceId: string, workItemId: string): Promise<boolean> {
  const rows = await db
    .select({ type: events.type, payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.workspaceId, workspaceId),
        eq(events.workItemId, workItemId),
        inArray(events.type, ['pr.opened', 'pr.merged', 'pr.closed']),
      ),
    )

  const closingNumbers = new Set<number>()
  const resolvedNumbers = new Set<number>()
  for (const row of rows) {
    const payload = row.payload as { number?: unknown; closing?: unknown } | null
    const number = payload?.number
    if (typeof number !== 'number') continue
    if (row.type === 'pr.opened' && payload?.closing === true) closingNumbers.add(number)
    if (row.type === 'pr.merged' || row.type === 'pr.closed') resolvedNumbers.add(number)
  }

  if (closingNumbers.size === 0) return false
  return Array.from(closingNumbers).every((n) => resolvedNumbers.has(n))
}
