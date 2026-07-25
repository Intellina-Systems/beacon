import { and, eq, isNull } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { cycles } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canManageWorkspaceConfig, forbidden } from '@/lib/auth/permissions'
import { closeCycleAndRollover } from '@/lib/cycles/lifecycle'
import { snapshotCycle } from '@/lib/cycles/snapshots'

// Ends a cycle early (Linear's "start cycle today" equivalent, applied to the
// cycle that's ending rather than the next one): takes a final snapshot, then
// rolls unfinished items into a freshly created next cycle.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageWorkspaceConfig(ctx)) return forbidden()

  const { id } = await params
  const [cycle] = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.id, id), eq(cycles.workspaceId, ctx.workspaceId), isNull(cycles.closedAt)))
    .limit(1)
  if (!cycle) return Response.json({ error: 'Cycle not found or already closed' }, { status: 404 })

  await snapshotCycle(cycle)
  const { closed, next, rolledOver } = await closeCycleAndRollover(cycle)

  return Response.json({ closed, next, rolledOver })
}
