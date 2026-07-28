import { and, eq, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { invites } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { generateInviteToken, hashInviteToken, INVITE_TTL_MS } from '@/lib/invites'

// Mint a fresh join link for an outstanding invite. Only the hash of a token is
// ever stored, so the original link can't be re-displayed — the pending list
// calls this instead to hand out a new one.
//
// Deliberately does NOT go through POST /api/invites: that route takes an
// accessRole defaulting to 'engineer' and writes it to the member, so reusing
// it here would silently demote anyone invited as an admin or manager.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const { id } = await params

  const [existing] = await db
    .select({ id: invites.id, memberId: invites.memberId, email: invites.email })
    .from(invites)
    .where(and(eq(invites.id, id), eq(invites.workspaceId, ctx.workspaceId), isNull(invites.acceptedAt)))
    .limit(1)

  if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

  // Retire the old token first so a regenerate can never leave two live links.
  await db.update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, existing.id))

  const token = generateInviteToken()
  const [invite] = await db
    .insert(invites)
    .values({
      id: nanoid(),
      workspaceId: ctx.workspaceId,
      memberId: existing.memberId,
      email: existing.email,
      tokenHash: hashInviteToken(token),
      invitedByMemberId: ctx.member.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning({ id: invites.id, expiresAt: invites.expiresAt })

  const url = `${new URL(_req.url).origin}/join/${token}`
  return Response.json({ invite: { id: invite.id, memberId: existing.memberId, url, expiresAt: invite.expiresAt } })
}
