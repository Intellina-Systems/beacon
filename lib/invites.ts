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

export type ClaimResult = { ok: true; workspaceId: string } | { ok: false; error: string }

// Bind the signing-in user to the pre-shaped member row the admin created.
export async function claimInvite(token: string, userId: string): Promise<ClaimResult> {
  const invite = await findClaimableInvite(token)
  if (!invite) return { ok: false, error: 'This invite link is invalid, expired, or already used' }

  const [existing] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.workspaceId, invite.workspaceId), eq(members.authUserId, userId)))
    .limit(1)
  if (existing) return { ok: false, error: 'You are already a member of this workspace' }

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
