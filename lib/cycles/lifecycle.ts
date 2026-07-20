import 'server-only'

import { and, asc, desc, eq, gte, isNull, lt, lte, notInArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { cycles, workItems, type Cycle } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'
import { snapshotCycle } from './snapshots'

export interface CreateCycleInput {
  workspaceId: string
  projectId: string
  startsAt: Date
  endsAt: Date
  cooldownEndsAt?: Date | null
  name?: string | null
}

// Allocates the next per-project cycle number and starts it. No manual sprint
// ceremony after this: the cron (rolloverDueCycles) keeps the chain going.
export async function createCycle(input: CreateCycleInput): Promise<Cycle> {
  const [last] = await db
    .select({ number: cycles.number })
    .from(cycles)
    .where(eq(cycles.projectId, input.projectId))
    .orderBy(desc(cycles.number))
    .limit(1)
  const number = (last?.number ?? 0) + 1

  const [cycle] = await db
    .insert(cycles)
    .values({
      id: generateId(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      number,
      name: input.name ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      cooldownEndsAt: input.cooldownEndsAt ?? null,
    })
    .returning()

  await ingestEvents(
    [
      {
        type: 'sprint.started',
        source: 'system',
        summary: `Cycle ${cycle.name ?? cycle.number} started`,
        externalId: `cycle:${cycle.id}:started`,
        occurredAt: cycle.startsAt,
        payload: { cycleId: cycle.id, projectId: input.projectId, number: cycle.number },
      },
    ],
    { workspaceId: input.workspaceId },
  )

  return cycle
}

// Closes a cycle and rolls every unfinished (not done/cancelled) item into a
// freshly created next cycle of the same duration — Linear's "no cycle
// creation ceremony" model. Past cycles are never rewritten: closedAt is
// permanent, and the caller is expected to have taken a final snapshot
// (see rolloverDueCycles) before items move out.
export async function closeCycleAndRollover(cycle: Cycle): Promise<{ closed: Cycle; next: Cycle; rolledOver: number }> {
  const duration = cycle.endsAt.getTime() - cycle.startsAt.getTime()
  const cooldownGapMs = cycle.cooldownEndsAt ? Math.max(cycle.cooldownEndsAt.getTime() - cycle.endsAt.getTime(), 0) : 0
  const nextStartsAt = new Date(cycle.endsAt.getTime() + cooldownGapMs)
  const nextEndsAt = new Date(nextStartsAt.getTime() + duration)

  const next = await createCycle({
    workspaceId: cycle.workspaceId,
    projectId: cycle.projectId,
    startsAt: nextStartsAt,
    endsAt: nextEndsAt,
    cooldownEndsAt: cycle.cooldownEndsAt ? new Date(nextEndsAt.getTime() + cooldownGapMs) : null,
  })

  const unfinished = await db
    .select({ id: workItems.id, key: workItems.key, title: workItems.title })
    .from(workItems)
    .where(and(eq(workItems.cycleId, cycle.id), notInArray(workItems.status, ['done', 'cancelled'])))

  const rolloverEvents: RawEvent[] = unfinished.flatMap((item) => [
    {
      type: 'sprint.item_removed',
      source: 'system',
      summary: `${item.key ?? item.title} rolled out of cycle ${cycle.number}`,
      task: item.id,
      externalId: `workitem:${item.id}:cycle:${cycle.id}:removed`,
      payload: { cycleId: cycle.id, reason: 'rollover' },
    },
    {
      type: 'sprint.item_added',
      source: 'system',
      summary: `${item.key ?? item.title} rolled into cycle ${next.number}`,
      task: item.id,
      externalId: `workitem:${item.id}:cycle:${next.id}:joined-rollover`,
      payload: { cycleId: next.id, reason: 'rollover' },
    },
  ])

  for (const item of unfinished) {
    await db.update(workItems).set({ cycleId: next.id, updatedAt: new Date() }).where(eq(workItems.id, item.id))
  }
  if (rolloverEvents.length > 0) {
    await ingestEvents(rolloverEvents, { workspaceId: cycle.workspaceId, defaultSource: 'system' })
  }

  const [closed] = await db
    .update(cycles)
    .set({ closedAt: new Date(), updatedAt: new Date() })
    .where(eq(cycles.id, cycle.id))
    .returning()

  await ingestEvents(
    [
      {
        type: 'sprint.closed',
        source: 'system',
        summary:
          unfinished.length > 0
            ? `Cycle ${cycle.name ?? cycle.number} closed — ${unfinished.length} item(s) rolled to cycle ${next.number}`
            : `Cycle ${cycle.name ?? cycle.number} closed`,
        externalId: `cycle:${cycle.id}:closed`,
        payload: { cycleId: cycle.id, rolledOverCount: unfinished.length, nextCycleId: next.id },
      },
    ],
    { workspaceId: cycle.workspaceId },
  )

  return { closed, next, rolledOver: unfinished.length }
}

// Cron entry point: close (and roll over) every cycle whose end date has
// passed but hasn't been closed yet. A final snapshot is taken immediately
// before rollover so the historical burnup ends at the true moment of closure.
export async function rolloverDueCycles(): Promise<{ closed: number }> {
  const due = await db
    .select()
    .from(cycles)
    .where(and(isNull(cycles.closedAt), lt(cycles.endsAt, new Date())))

  let closed = 0
  for (const cycle of due) {
    await snapshotCycle(cycle)
    await closeCycleAndRollover(cycle)
    closed++
  }
  return { closed }
}

// The cycle a project's planning view should show: the active one if there is
// one, else the soonest upcoming one, else null (project hasn't opted into cycles).
export async function getCurrentCycle(projectId: string): Promise<Cycle | null> {
  const now = new Date()
  const [active] = await db
    .select()
    .from(cycles)
    .where(
      and(eq(cycles.projectId, projectId), isNull(cycles.closedAt), lte(cycles.startsAt, now), gte(cycles.endsAt, now)),
    )
    .limit(1)
  if (active) return active

  const [upcoming] = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.projectId, projectId), isNull(cycles.closedAt)))
    .orderBy(asc(cycles.startsAt))
    .limit(1)
  return upcoming ?? null
}
