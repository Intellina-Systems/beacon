import 'server-only'

import crypto from 'crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import { db } from '@/lib/db/client'
import { mcpAuthorizationCodes, type McpAuthorizationCode } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'

const generateSecret = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 40)

// OAuth 2.1 codes are meant to be exchanged within seconds of issuing, not
// held — 60s gives real network round-trips room without leaving a
// meaningfully long-lived bearer credential lying around.
const CODE_TTL_MS = 60 * 1000

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export async function createAuthorizationCode(input: {
  clientId: string // internal mcp_oauth_clients.id, not the public client_id
  memberId: string
  workspaceId: string
  redirectUri: string
  codeChallenge: string
  scope: string
}): Promise<{ code: string }> {
  const code = generateSecret()
  await db.insert(mcpAuthorizationCodes).values({
    id: generateId(),
    codeHash: hashCode(code),
    clientId: input.clientId,
    memberId: input.memberId,
    workspaceId: input.workspaceId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: 'S256',
    scope: input.scope,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  })
  return { code }
}

// Atomic single-use consumption — the same idiom lib/invites.ts:claimInvite()
// uses (UPDATE ... WHERE consumedAt IS NULL RETURNING), closing the race
// where two token requests hit the same code concurrently. Returns null for
// an unknown, already-used, or expired code; the token route turns that into
// a single generic `invalid_grant` — never distinguishing which, so a guess
// learns nothing from the response.
export async function consumeAuthorizationCode(code: string): Promise<McpAuthorizationCode | null> {
  const [row] = await db
    .update(mcpAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(mcpAuthorizationCodes.codeHash, hashCode(code)),
        isNull(mcpAuthorizationCodes.consumedAt),
        gt(mcpAuthorizationCodes.expiresAt, new Date()),
      ),
    )
    .returning()
  return row ?? null
}
