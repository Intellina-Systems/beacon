import 'server-only'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { mcpOauthGrants } from '@/lib/db/schema'
import { encryptJWE } from '@/lib/jwe/encrypt'
import { decryptJWE } from '@/lib/jwe/decrypt'
import { isGrantActive } from '@/lib/oauth/grants'

// An MCP access token is a self-contained JWE, not a database row — same
// mechanism session cookies already use (lib/jwe). Verifying one costs a
// decrypt plus (once lib/oauth/grants.ts exists) one indexed lookup by
// `grantId` to confirm the grant hasn't been revoked; there is deliberately
// no separate access-token table to hash-compare against.
export interface McpAccessTokenPayload {
  grantId: string
  memberId: string
  workspaceId: string
  // Space-separated, OAuth-style: "read" or "read write".
  scope: string
}

const ACCESS_TOKEN_TTL = '1h'

export async function issueMcpAccessToken(payload: McpAccessTokenPayload): Promise<string> {
  return encryptJWE(payload, ACCESS_TOKEN_TTL)
}

// Short clock tolerance: a 1hr-TTL token verified from a different Vercel
// region than it was minted in should not fail on a few hundred ms of drift.
//
// A valid-looking JWE is not enough — it also has to name a grant that is
// still active, so revoking a connection (or deactivating the member behind
// it) takes effect on the very next call rather than waiting out the token's
// remaining TTL. That check is one indexed lookup by primary key, the same
// cost getWorkspaceContext() already pays per request.
export async function verifyMcpAccessToken(token: string): Promise<McpAccessTokenPayload | undefined> {
  const payload = await decryptJWE<McpAccessTokenPayload>(token, undefined, { clockTolerance: '5s' })
  if (!payload || typeof payload !== 'object') return undefined
  if (!payload.grantId || !payload.memberId || !payload.workspaceId || !payload.scope) return undefined
  if (!(await isGrantActive(payload.grantId))) return undefined

  // Fire-and-forget, same pattern lib/api-keys.ts:verifyApiKey uses — a
  // "last used" timestamp is a UI nicety, never worth failing or slowing a
  // real request over.
  db.update(mcpOauthGrants)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpOauthGrants.id, payload.grantId))
    .then(
      () => {},
      () => {},
    )

  return payload
}
