import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { events, members, workItems, type InsertEvent, type Member } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { statusEffectOf } from './taxonomy'

// Wire format accepted by POST /api/events — what agents, CI, and plugins send.
export const rawEventSchema = z.object({
  type: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/, 'type must be dot-namespaced, e.g. "task.started"'),
  source: z
    .enum(['github', 'linear', 'cicd', 'slack', 'calendar', 'agent', 'knowledge', 'manual', 'system'])
    .optional(),
  summary: z.string().max(500).optional(),
  // Correlation handles — any of these may identify the work item / engineer
  task: z.string().max(200).optional(), // work item key ("BCN-42") or id
  engineer: z.string().max(200).optional(), // member name, alias, github login…
  externalId: z.string().max(300).optional(),
  reason: z.string().max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  occurredAt: z.coerce.date().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export type RawEvent = z.infer<typeof rawEventSchema>

export interface IngestOptions {
  userId: string
  defaultSource?: InsertEvent['source']
}

export interface IngestResult {
  inserted: number
  deduplicated: number
  eventIds: string[]
}

function defaultSummary(raw: RawEvent): string {
  const bits = [raw.type]
  if (raw.task) bits.push(raw.task)
  if (raw.reason) bits.push(raw.reason)
  return bits.join(' — ').slice(0, 500)
}

function memberMatches(member: Member, needle: string): boolean {
  const lower = needle.toLowerCase()
  return (
    member.name.toLowerCase() === lower ||
    member.email?.toLowerCase() === lower ||
    member.githubUsername?.toLowerCase() === lower ||
    member.linearUserId === needle ||
    member.slackHandle?.toLowerCase() === lower ||
    (member.aliases ?? []).some((alias) => alias.toLowerCase() === lower)
  )
}

export function resolveMember(roster: Member[], label: string | undefined | null): Member | null {
  if (!label) return null
  return roster.find((member) => memberMatches(member, label)) ?? null
}

// Ingest a batch of events: resolve identities, dedupe, append, and fold the
// status effects into the referenced work items.
export async function ingestEvents(rawEvents: RawEvent[], options: IngestOptions): Promise<IngestResult> {
  const { userId, defaultSource = 'manual' } = options
  if (rawEvents.length === 0) return { inserted: 0, deduplicated: 0, eventIds: [] }

  const roster = await db.select().from(members).where(eq(members.userId, userId))

  // Resolve work item handles (key, external id, or internal id) in one query
  const taskHandles = Array.from(new Set(rawEvents.map((raw) => raw.task).filter((t): t is string => Boolean(t))))
  const workItemRows = taskHandles.length
    ? await db
        .select({ id: workItems.id, key: workItems.key, externalId: workItems.externalId })
        .from(workItems)
        .where(
          and(
            eq(workItems.userId, userId),
            sql`(${inArray(workItems.id, taskHandles)} or ${inArray(workItems.key, taskHandles)} or ${inArray(workItems.externalId, taskHandles)})`,
          ),
        )
    : []

  const workItemByHandle = new Map<string, string>()
  for (const row of workItemRows) {
    workItemByHandle.set(row.id, row.id)
    if (row.key) workItemByHandle.set(row.key, row.id)
    if (row.externalId) workItemByHandle.set(row.externalId, row.id)
  }

  const now = new Date()
  const inserts: InsertEvent[] = rawEvents.map((raw) => {
    const member = resolveMember(roster, raw.engineer)
    const workItemId = raw.task ? (workItemByHandle.get(raw.task) ?? null) : null
    return {
      id: generateId(16),
      userId,
      source: raw.source ?? defaultSource,
      type: raw.type,
      memberId: member?.id ?? null,
      actorLabel: raw.engineer ?? member?.name ?? null,
      workItemId,
      summary: raw.summary ?? defaultSummary(raw),
      payload: {
        ...(raw.payload ?? {}),
        ...(raw.reason ? { reason: raw.reason } : {}),
        ...(raw.task && !workItemId ? { unresolvedTask: raw.task } : {}),
      },
      externalId: raw.externalId ?? null,
      confidence: raw.confidence ?? null,
      occurredAt: raw.occurredAt ?? now,
    }
  })

  const insertedRows = await db
    .insert(events)
    .values(inserts)
    .onConflictDoNothing({ target: [events.userId, events.source, events.externalId] })
    .returning({ id: events.id, workItemId: events.workItemId, type: events.type, occurredAt: events.occurredAt })

  // Fold status effects into referenced work items, latest event wins
  const statusUpdates = new Map<string, { status: string; at: Date }>()
  for (const raw of rawEvents) {
    const workItemId = raw.task ? workItemByHandle.get(raw.task) : null
    if (!workItemId) continue
    const effect = statusEffectOf(raw.type, raw.payload)
    const at = raw.occurredAt ?? now
    if (effect) {
      const existing = statusUpdates.get(workItemId)
      if (!existing || at >= existing.at) statusUpdates.set(workItemId, { status: effect, at })
    }
  }

  const touchedWorkItemIds = new Set(insertedRows.map((row) => row.workItemId).filter((id): id is string => !!id))

  await Promise.all([
    ...Array.from(statusUpdates.entries()).map(([workItemId, { status, at }]) =>
      db
        .update(workItems)
        .set({ status: status as never, statusChangedAt: at, lastEventAt: at, updatedAt: now })
        .where(and(eq(workItems.id, workItemId), eq(workItems.userId, userId))),
    ),
    ...Array.from(touchedWorkItemIds)
      .filter((id) => !statusUpdates.has(id))
      .map((workItemId) =>
        db
          .update(workItems)
          .set({ lastEventAt: now, updatedAt: now })
          .where(and(eq(workItems.id, workItemId), eq(workItems.userId, userId))),
      ),
  ])

  return {
    inserted: insertedRows.length,
    deduplicated: inserts.length - insertedRows.length,
    eventIds: insertedRows.map((row) => row.id),
  }
}
