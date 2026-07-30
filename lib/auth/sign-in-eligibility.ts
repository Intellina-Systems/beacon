import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts, members, users, workspaces } from '@/lib/db/schema'
import { findInviteByToken } from '@/lib/invites'

/**
 * Who is allowed to sign in.
 *
 * Beacon is invite-only: authenticating with GitHub proves *who you are*, not
 * that you belong here. This module answers the second question, and the OAuth
 * callbacks refuse before a session cookie is ever written.
 *
 * Exactly three ways in:
 *   1. You hold a live invite link (the acceptance flow — you don't exist yet).
 *   2. Your OAuth identity is already bound to an active member row.
 *   3. The install has no workspaces at all, so the first person to arrive
 *      becomes its founder.
 *
 * Everyone else is turned away, and no `users` row is created for them.
 */

/** The providers a session can be created from — mirrors `users.provider`. */
export type AuthProvider = 'github' | 'vercel'

export type SignInRefusal = 'not_invited'
export type SignInDecision = { allowed: true } | { allowed: false; reason: SignInRefusal }

const ALLOWED: SignInDecision = { allowed: true }

/**
 * Map an OAuth identity to the internal user it already belongs to — without
 * creating one. Mirrors the two links `upsertUser` understands: the primary
 * `users.provider/externalId` pair, and a `accounts` row from someone who
 * signed in another way and connected this provider later.
 */
export async function findExistingUserId(provider: AuthProvider, externalId: string): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.provider, provider), eq(users.externalId, externalId)))
    .limit(1)
  if (user) return user.id

  // `accounts` only ever holds connected GitHub identities.
  if (provider !== 'github') return null
  const [account] = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(and(eq(accounts.provider, 'github'), eq(accounts.externalUserId, externalId)))
    .limit(1)
  return account?.userId ?? null
}

/**
 * Does this user hold access to any workspace? A member row only carries an
 * `authUserId` once an invite was accepted, so this is precisely "has been let
 * in by an admin and has not been removed since".
 */
export async function hasActiveMembership(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.authUserId, userId), eq(members.status, 'active')))
    .limit(1)
  return !!row
}

/** A fresh install with nobody in it yet — the founder has to get in somehow. */
export async function isUnclaimedInstall(): Promise<boolean> {
  const [row] = await db.select({ id: workspaces.id }).from(workspaces).limit(1)
  return !row
}

export async function decideSignIn(input: {
  provider: AuthProvider
  externalId: string
  inviteToken?: string | null
}): Promise<SignInDecision> {
  // An invite link is the one credential that works before you have an account.
  // It only gets you past this gate; `claimInvite` still decides whether the
  // link is actually yours.
  if (input.inviteToken && (await findInviteByToken(input.inviteToken))) return ALLOWED

  const userId = await findExistingUserId(input.provider, input.externalId)
  if (userId && (await hasActiveMembership(userId))) return ALLOWED

  if (await isUnclaimedInstall()) return ALLOWED

  return { allowed: false, reason: 'not_invited' }
}
