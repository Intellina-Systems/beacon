import { and, eq, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { invites, members } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { generateInviteToken, hashInviteToken, INVITE_TTL_MS } from '@/lib/invites'

// Mints this member's standing sign-in link.
//
// Only the hash of a token is stored, so an existing link can never be read
// back — each call issues a new one and retires the previous, exactly like the
// pending-invite regenerate flow.
//
// For a member already bound to a GitHub account the new row is marked accepted
// straight away, which is what makes it a permanent re-entry link instead of a
// one-shot invitation that dies after first use. It still grants nothing by
// itself: it routes to GitHub sign-in, and only the account already linked to
// this member can get through.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const { id } = await params

  const [member] = await db
    .select({ id: members.id, name: members.name, email: members.email, authUserId: members.authUserId })
    .from(members)
    .where(and(eq(members.id, id), eq(members.workspaceId, ctx.workspaceId)))
    .limit(1)

  if (!member) return Response.json({ error: 'Member not found' }, { status: 404 })

  // One live link per member — retire anything outstanding first.
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.memberId, member.id), isNull(invites.revokedAt)))

  const now = new Date()
  const token = generateInviteToken()
  const [invite] = await db
    .insert(invites)
    .values({
      id: nanoid(),
      workspaceId: ctx.workspaceId,
      memberId: member.id,
      email: member.email,
      tokenHash: hashInviteToken(token),
      invitedByMemberId: ctx.member.id,
      // Unbound members still get a real invitation window; bound members get a
      // link that never lapses, since it is now their only way back in.
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      acceptedAt: member.authUserId ? now : null,
    })
    .returning({ id: invites.id, expiresAt: invites.expiresAt })

  return Response.json({
    invite: {
      id: invite.id,
      memberId: member.id,
      url: `${new URL(req.url).origin}/join/${token}`,
      // A bound member's link is reusable and does not lapse; an unbound one is
      // still a time-limited invitation.
      reusable: Boolean(member.authUserId),
      expiresAt: member.authUserId ? null : invite.expiresAt,
    },
  })
}
