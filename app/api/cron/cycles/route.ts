import { type NextRequest } from 'next/server'
import { isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { cycles } from '@/lib/db/schema'
import { rolloverDueCycles } from '@/lib/cycles/lifecycle'
import { snapshotCycle } from '@/lib/cycles/snapshots'

export const maxDuration = 300

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production'
  }
  return req.headers.get('authorization') === `Bearer ${cronSecret}`
}

// Runs hourly: closes (and rolls over) any cycle whose end date has passed,
// then snapshots every still-open cycle for burnup/velocity charts. Snapshots
// are upserted per (cycle, day), so running this more than once a day just
// keeps today's point fresh — it's idempotent, not additive.
export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { closed } = await rolloverDueCycles()

    const openCycles = await db.select().from(cycles).where(isNull(cycles.closedAt))
    for (const cycle of openCycles) {
      await snapshotCycle(cycle)
    }

    return Response.json({ success: true, closed, snapshotted: openCycles.length })
  } catch (error) {
    console.error('[cron cycles] failed:', error)
    return Response.json({ error: 'Cron cycles failed' }, { status: 500 })
  }
}
