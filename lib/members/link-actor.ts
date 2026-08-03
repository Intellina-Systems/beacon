import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { events, members } from '@/lib/db/schema'

export class LinkActorError extends Error {}

// Confirms an admin's "map this unresolved label to this member" action from
// the Unmatched identities table: adds the label to the member's aliases (so
// future events resolve via memberMatches) and backfills memberId on the
// already-ingested events that share this exact label and are still
// unattributed. The backfill is scoped to the one label an admin just
// explicitly confirmed — not a blanket historical rewrite — otherwise a
// resolved label would keep reappearing in the table forever since past rows
// are never touched by ordinary ingestion.
export async function linkActorToMember(workspaceId: string, memberId: string, actorLabel: string): Promise<void> {
  const [member] = await db
    .select({ aliases: members.aliases })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.workspaceId, workspaceId)))
    .limit(1)
  if (!member) throw new LinkActorError('Member not found')

  const nextAliases = Array.from(new Set([...(member.aliases ?? []), actorLabel]))
  await db
    .update(members)
    .set({ aliases: nextAliases, updatedAt: new Date() })
    .where(and(eq(members.id, memberId), eq(members.workspaceId, workspaceId)))

  await db
    .update(events)
    .set({ memberId })
    .where(and(eq(events.workspaceId, workspaceId), eq(events.actorLabel, actorLabel), isNull(events.memberId)))
}
