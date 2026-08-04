import { type NextRequest } from 'next/server'
import { and, eq, gt, ne } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docPresence, members } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { resolveDocAccess } from '@/lib/docs/access'
import { generateId } from '@/lib/utils/id'

// Anyone whose heartbeat landed in the last 30s counts as "here" — a bit
// more than 2x the client's own ~15s heartbeat interval, so one missed beat
// doesn't flicker someone in and out.
const ACTIVE_WINDOW_MS = 30_000

// Heartbeat: marks the caller present on this doc and returns everyone else
// currently here. Called on a ~15s interval while a doc is open — a plain
// upsert-and-read, no websocket, matching the rest of this feature's
// "polling is enough, real-time is a separate later decision" approach.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDocAccess(ctx, id)
  if (!access) return Response.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()
  await db
    .insert(docPresence)
    .values({ id: generateId(), docId: id, memberId: ctx.member.id, lastSeenAt: now })
    .onConflictDoUpdate({ target: [docPresence.docId, docPresence.memberId], set: { lastSeenAt: now } })

  const since = new Date(now.getTime() - ACTIVE_WINDOW_MS)
  const others = await db
    .select({ memberId: docPresence.memberId, name: members.name })
    .from(docPresence)
    .innerJoin(members, eq(members.id, docPresence.memberId))
    .where(and(eq(docPresence.docId, id), ne(docPresence.memberId, ctx.member.id), gt(docPresence.lastSeenAt, since)))

  return Response.json({ others })
}
