import type { NextRequest } from 'next/server'

// RFC 8414. mcp-handler ships a helper for the protected-resource metadata
// endpoint (see the sibling route) but not this one — Beacon is acting as
// its own Authorization Server, which is hand-rolled entirely. `issuer` is
// derived from the request origin, the same convention every existing OAuth
// route in this codebase already follows (no dedicated env var for it).
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' }

export function GET(req: NextRequest): Response {
  const origin = req.nextUrl.origin
  const metadata = {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    // Public/PKCE-only clients in v1 — see lib/oauth/clients.ts.
    token_endpoint_auth_methods_supported: ['none'],
  }
  return Response.json(metadata, { headers: CORS_HEADERS })
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
