import 'server-only'

import crypto from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import { db } from '@/lib/db/client'
import { invites, members, type Invite } from '@/lib/db/schema'

const generateSecret = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 32)

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateInviteToken(): string {
  return generateSecret()
}

// A claimable invite: unexpired, unrevoked, unclaimed.
export async function findClaimableInvite(token: string): Promise<Invite | null> {
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, hashInviteToken(token)), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
    .limit(1)
  if (!invite) return null
  if (invite.expiresAt.getTime() < Date.now()) return null
  return invite
}

/**
 * Any invite that hasn't been revoked, whether or not it was already accepted.
 *
 * Once accepted, a link stops being an invitation and becomes that member's
 * standing way back in — so it deliberately ignores `expiresAt`. That is safe
 * because the link grants nothing on its own: it routes to GitHub sign-in, and
 * re-entry still requires authenticating as the account already bound to the
 * member. A stranger holding the URL gets a sign-in page and then a refusal.
 *
 * Revoking still kills it instantly, which is the intended off switch.
 */
export async function findInviteByToken(token: string): Promise<Invite | null> {
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, hashInviteToken(token)), isNull(invites.revokedAt)))
    .limit(1)
  return invite ?? null
}

export type ClaimResult = { ok: true; workspaceId: string } | { ok: false; error: string }

// Bind the signing-in user to the pre-shaped member row the admin created.
// Idempotent on purpose: someone who already accepted this link and later
// signed out must be able to use it again to get back in, so re-use by the
// same account is a success rather than an error.
export async function claimInvite(token: string, userId: string): Promise<ClaimResult> {
  const invite = await findInviteByToken(token)
  if (!invite) return { ok: false, error: 'This invite link is invalid or has been revoked' }

  const [existing] = await db
    .select({ id: members.id, authUserId: members.authUserId })
    .from(members)
    .where(and(eq(members.workspaceId, invite.workspaceId), eq(members.authUserId, userId)))
    .limit(1)

  if (existing) {
    // Already bound. If this is their own link they're simply back — let them
    // through. If it's someone else's, refuse rather than rebinding.
    if (existing.id === invite.memberId) return { ok: true, workspaceId: invite.workspaceId }
    return { ok: false, error: 'You are already a member of this workspace' }
  }

  // First use still honours the invitation window; only accepted links become
  // permanently reusable.
  if (!invite.acceptedAt && invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'This invite link has expired — ask an admin for a new one' }
  }
  if (invite.acceptedAt) {
    return { ok: false, error: 'This link belongs to another member. Ask an admin for your own.' }
  }

  const now = new Date()
  const [claimed] = await db
    .update(members)
    .set({ authUserId: userId, status: 'active', updatedAt: now })
    .where(and(eq(members.id, invite.memberId), isNull(members.authUserId)))
    .returning({ id: members.id })
  if (!claimed) return { ok: false, error: 'This invite has already been claimed' }

  await db.update(invites).set({ acceptedAt: now }).where(eq(invites.id, invite.id))
  return { ok: true, workspaceId: invite.workspaceId }
}
