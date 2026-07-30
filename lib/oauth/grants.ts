import 'server-only'

import crypto from 'crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import { db } from '@/lib/db/client'
import { members, mcpOauthClients, mcpOauthGrants, type McpOauthGrant } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'

const generateSecret = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 40)

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// A refresh token is "<grantId>.<secret>". The grantId prefix is what makes
// theft detection below possible without a separate token-history table: once
// a token is rotated away, its hash no longer matches anything, but the
// grantId in its prefix still resolves to the real grant — so a replayed
// stale token can be told apart from one that never existed.
function formatRefreshToken(grantId: string, secret: string): string {
  return `${grantId}.${secret}`
}

function parseRefreshToken(token: string): { grantId: string; secret: string } | null {
  const i = token.indexOf('.')
  if (i <= 0) return null
  return { grantId: token.slice(0, i), secret: token.slice(i + 1) }
}

export async function createGrant(input: {
  clientId: string // internal mcp_oauth_clients.id
  memberId: string
  workspaceId: string
  scope: string
}): Promise<{ grantId: string; refreshToken: string }> {
  const grantId = generateId()
  const refreshToken = formatRefreshToken(grantId, generateSecret())
  await db.insert(mcpOauthGrants).values({
    id: grantId,
    clientId: input.clientId,
    memberId: input.memberId,
    workspaceId: input.workspaceId,
    scope: input.scope,
    refreshTokenHash: hashToken(refreshToken),
  })
  return { grantId, refreshToken }
}

export type RefreshResult =
  | { ok: true; grant: McpOauthGrant; refreshToken: string }
  | { ok: false; reason: 'invalid' | 'revoked' }

// Rotates on every use (OAuth 2.1 best practice — a refresh token is only
// ever valid once). If the presented token's grantId resolves to a real,
// non-revoked grant but its hash does not match the grant's *current* stored
// hash, that is a replay of an already-rotated token, not a garden-variety
// invalid one — revoke the whole grant immediately rather than just
// rejecting the one request, per OAuth 2.1's reuse-detection recommendation.
export async function rotateRefreshToken(presented: string): Promise<RefreshResult> {
  const parsed = parseRefreshToken(presented)
  if (!parsed) return { ok: false, reason: 'invalid' }

  const [grant] = await db
    .select()
    .from(mcpOauthGrants)
    .where(and(eq(mcpOauthGrants.id, parsed.grantId), isNull(mcpOauthGrants.revokedAt)))
    .limit(1)
  if (!grant) return { ok: false, reason: 'invalid' }

  const presentedHash = hashToken(presented)
  if (grant.refreshTokenHash !== presentedHash) {
    await db.update(mcpOauthGrants).set({ revokedAt: new Date() }).where(eq(mcpOauthGrants.id, grant.id))
    return { ok: false, reason: 'revoked' }
  }

  const newRefreshToken = formatRefreshToken(grant.id, generateSecret())
  const [rotated] = await db
    .update(mcpOauthGrants)
    .set({ refreshTokenHash: hashToken(newRefreshToken), lastUsedAt: new Date() })
    // Re-checks the hash it just read, so two concurrent refreshes of the
    // same token can't both succeed — the loser sees 0 rows and reports invalid.
    .where(and(eq(mcpOauthGrants.id, grant.id), eq(mcpOauthGrants.refreshTokenHash, presentedHash)))
    .returning()
  if (!rotated) return { ok: false, reason: 'invalid' }

  return { ok: true, grant: rotated, refreshToken: newRefreshToken }
}

// For RFC 7009 token revocation: revokes the grant a *presented, verified*
// refresh token belongs to. Deliberately does not trust the grantId prefix
// alone — an unauthenticated caller naming any grantId and having it
// revoked without proving they hold a valid token for it would let one
// connection revoke an unrelated one. Returns true whether or not a grant
// was actually found/changed, matching RFC 7009 §2.2 (revocation is
// idempotent from the caller's point of view; an unknown token is not an error).
export async function revokeByRefreshToken(presented: string): Promise<true> {
  const parsed = parseRefreshToken(presented)
  if (!parsed) return true

  await db
    .update(mcpOauthGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpOauthGrants.id, parsed.grantId), eq(mcpOauthGrants.refreshTokenHash, hashToken(presented))))
  return true
}

// For the revoke route's authorization check: is this grant owned by the
// given member? (An admin may revoke any grant in the workspace regardless;
// that check happens at the route, this only answers the ownership question.)
export async function getGrantOwner(workspaceId: string, grantId: string): Promise<{ memberId: string } | null> {
  const [row] = await db
    .select({ memberId: mcpOauthGrants.memberId })
    .from(mcpOauthGrants)
    .where(and(eq(mcpOauthGrants.id, grantId), eq(mcpOauthGrants.workspaceId, workspaceId)))
    .limit(1)
  return row ?? null
}

export async function isGrantActive(grantId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: mcpOauthGrants.id })
    .from(mcpOauthGrants)
    .where(and(eq(mcpOauthGrants.id, grantId), isNull(mcpOauthGrants.revokedAt)))
    .limit(1)
  return !!row
}

// Shared by the self-revoke route (a member disconnecting their own MCP
// connection) and the admin-revoke route (workspace-wide oversight) — the
// workspace scope on the WHERE clause is what stops one from reaching into
// another workspace's grant, not a role check the caller has to remember.
export async function revokeGrant(workspaceId: string, grantId: string): Promise<boolean> {
  const [row] = await db
    .update(mcpOauthGrants)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpOauthGrants.id, grantId),
        eq(mcpOauthGrants.workspaceId, workspaceId),
        isNull(mcpOauthGrants.revokedAt),
      ),
    )
    .returning({ id: mcpOauthGrants.id })
  return !!row
}

export interface GrantView {
  id: string
  clientName: string
  scope: string
  lastUsedAt: Date | null
  createdAt: Date
  memberId: string
  memberName: string
}

// A member's own active connections — components/*/mcp-connections-card.tsx.
export async function listGrantsForMember(memberId: string): Promise<GrantView[]> {
  return db
    .select({
      id: mcpOauthGrants.id,
      clientName: mcpOauthClients.clientName,
      scope: mcpOauthGrants.scope,
      lastUsedAt: mcpOauthGrants.lastUsedAt,
      createdAt: mcpOauthGrants.createdAt,
      memberId: mcpOauthGrants.memberId,
      memberName: members.name,
    })
    .from(mcpOauthGrants)
    .innerJoin(mcpOauthClients, eq(mcpOauthClients.id, mcpOauthGrants.clientId))
    .innerJoin(members, eq(members.id, mcpOauthGrants.memberId))
    .where(and(eq(mcpOauthGrants.memberId, memberId), isNull(mcpOauthGrants.revokedAt)))
    .orderBy(desc(mcpOauthGrants.createdAt))
}

// Every active connection workspace-wide, for the admin oversight table on
// /integrations — visibility only, revocation still goes through the same
// revokeGrant() the self-serve card uses.
export async function listGrantsForWorkspace(workspaceId: string): Promise<GrantView[]> {
  return db
    .select({
      id: mcpOauthGrants.id,
      clientName: mcpOauthClients.clientName,
      scope: mcpOauthGrants.scope,
      lastUsedAt: mcpOauthGrants.lastUsedAt,
      createdAt: mcpOauthGrants.createdAt,
      memberId: mcpOauthGrants.memberId,
      memberName: members.name,
    })
    .from(mcpOauthGrants)
    .innerJoin(mcpOauthClients, eq(mcpOauthClients.id, mcpOauthGrants.clientId))
    .innerJoin(members, eq(members.id, mcpOauthGrants.memberId))
    .where(and(eq(mcpOauthGrants.workspaceId, workspaceId), isNull(mcpOauthGrants.revokedAt)))
    .orderBy(desc(mcpOauthGrants.createdAt))
}
