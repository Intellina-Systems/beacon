import { type NextRequest } from 'next/server'
import crypto from 'crypto'
import { consumeAuthorizationCode } from '@/lib/oauth/codes'
import { createGrant, rotateRefreshToken } from '@/lib/oauth/grants'
import { getClientByPublicId } from '@/lib/oauth/clients'
import { issueMcpAccessToken } from '@/lib/mcp/tokens'

// Matches lib/mcp/tokens.ts's ACCESS_TOKEN_TTL ('1h') — kept as a literal
// here rather than exported, since this is the only other place that needs
// to know it (the response body's expires_in, informational for the client).
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60

// RFC 6749 §5.1 — some MCP client SDKs check for these and warn or fail
// without them, since a token response must never be cached.
const NO_STORE_HEADERS: HeadersInit = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

function tokenError(error: string, description?: string, status = 400): Response {
  return Response.json({ error, error_description: description }, { status, headers: NO_STORE_HEADERS })
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = base64url(crypto.createHash('sha256').update(codeVerifier).digest())
  return computed === codeChallenge
}

export async function POST(req: NextRequest): Promise<Response> {
  const form = await req.formData().catch(() => null)
  if (!form) return tokenError('invalid_request', 'Expected an application/x-www-form-urlencoded body')

  const grantType = form.get('grant_type')

  if (grantType === 'authorization_code') {
    const code = form.get('code')
    const redirectUri = form.get('redirect_uri')
    const codeVerifier = form.get('code_verifier')
    const clientId = form.get('client_id')
    if (
      typeof code !== 'string' ||
      typeof redirectUri !== 'string' ||
      typeof codeVerifier !== 'string' ||
      typeof clientId !== 'string'
    ) {
      return tokenError('invalid_request', 'code, redirect_uri, code_verifier, and client_id are required')
    }

    const row = await consumeAuthorizationCode(code)
    if (!row) return tokenError('invalid_grant', 'Unknown, expired, or already-used code')

    // redirect_uri must match exactly what was validated when the code was
    // issued — the classic authorization-code-injection check (RFC 6819
    // §4.4.1.13): without it, an attacker who intercepts a code for one
    // redirect_uri could redeem it against a different one they control.
    const client = await getClientByPublicId(clientId)
    if (!client || client.id !== row.clientId || row.redirectUri !== redirectUri) {
      return tokenError('invalid_grant', 'client_id or redirect_uri does not match the authorization request')
    }
    if (!verifyPkce(codeVerifier, row.codeChallenge)) {
      return tokenError('invalid_grant', 'code_verifier does not match the original code_challenge')
    }

    const { grantId, refreshToken } = await createGrant({
      clientId: client.id,
      memberId: row.memberId,
      workspaceId: row.workspaceId,
      scope: row.scope,
    })
    const accessToken = await issueMcpAccessToken({
      grantId,
      memberId: row.memberId,
      workspaceId: row.workspaceId,
      scope: row.scope,
    })

    return Response.json(
      {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        refresh_token: refreshToken,
        scope: row.scope,
      },
      { headers: NO_STORE_HEADERS },
    )
  }

  if (grantType === 'refresh_token') {
    const presented = form.get('refresh_token')
    if (typeof presented !== 'string') return tokenError('invalid_request', 'refresh_token is required')

    const result = await rotateRefreshToken(presented)
    if (!result.ok) {
      return tokenError(
        'invalid_grant',
        result.reason === 'revoked' ? 'This connection was revoked' : 'Invalid refresh token',
      )
    }

    const accessToken = await issueMcpAccessToken({
      grantId: result.grant.id,
      memberId: result.grant.memberId,
      workspaceId: result.grant.workspaceId,
      scope: result.grant.scope,
    })

    return Response.json(
      {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        refresh_token: result.refreshToken,
        scope: result.grant.scope,
      },
      { headers: NO_STORE_HEADERS },
    )
  }

  return tokenError('unsupported_grant_type', 'Only authorization_code and refresh_token are supported')
}
