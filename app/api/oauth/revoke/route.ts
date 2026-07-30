import { type NextRequest } from 'next/server'
import { revokeByRefreshToken } from '@/lib/oauth/grants'

// RFC 7009. Secondary path — the "Disconnect" button on a member's own page
// and the admin oversight table (both calling lib/oauth/grants.ts:revokeGrant
// directly) are the primary way a connection gets revoked; this exists for
// MCP clients that call it themselves on disconnect.
export async function POST(req: NextRequest): Promise<Response> {
  const form = await req.formData().catch(() => null)
  const token = form?.get('token')

  // RFC 7009 §2.2: an invalid or unknown token still returns 200 —
  // revocation is idempotent from the caller's point of view, and the
  // response must not leak whether the token was ever valid.
  if (typeof token === 'string') await revokeByRefreshToken(token)

  return new Response(null, { status: 200 })
}
