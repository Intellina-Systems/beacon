import 'server-only'

import { getClientByPublicId, isSameRedirectUri } from './clients'
import type { McpOauthClient } from '@/lib/db/schema'

export interface ParsedAuthorizeRequest {
  client: McpOauthClient
  redirectUri: string
  codeChallenge: string
  scope: string
  state: string | null
}

export type AuthorizeValidation = { ok: true; request: ParsedAuthorizeRequest } | { ok: false; error: string }

const ALLOWED_SCOPES = new Set(['read', 'read write'])

// Shared by the GET consent page and the POST decision route, so both agree
// on what a legitimate request looks like: the page must not display a
// consent screen for something the route would then refuse to act on, and
// the route must not trust anything the page rendered without re-checking it
// — a hidden form field is just a suggestion from the browser, not a fact.
export async function validateAuthorizeRequest(params: URLSearchParams): Promise<AuthorizeValidation> {
  const clientId = params.get('client_id')
  if (!clientId) return { ok: false, error: 'client_id is required' }
  const client = await getClientByPublicId(clientId)
  if (!client) return { ok: false, error: 'Unknown client_id — this app has not registered with Beacon' }

  // Matched against the client's registration via isSameRedirectUri — exact
  // for a real host (the open-redirect-via-authorize guard), port-agnostic
  // and localhost/127.0.0.1-interchangeable for loopback (what a native
  // client's ephemeral callback port requires; see lib/oauth/clients.ts).
  const redirectUri = params.get('redirect_uri')
  if (!redirectUri || !client.redirectUris.some((registered) => isSameRedirectUri(registered, redirectUri))) {
    return { ok: false, error: "redirect_uri does not match this client's registration" }
  }

  // OAuth 2.1: PKCE is mandatory for public clients, S256 only — a missing
  // challenge or the legacy "plain" method is refused here rather than let
  // through to fail later at token exchange.
  const codeChallenge = params.get('code_challenge')
  if (!codeChallenge || params.get('code_challenge_method') !== 'S256') {
    return { ok: false, error: 'A PKCE code_challenge with method S256 is required' }
  }

  if (params.get('response_type') !== 'code') {
    return { ok: false, error: 'Only response_type=code is supported' }
  }

  const scope = params.get('scope')?.trim() || 'read'
  if (!ALLOWED_SCOPES.has(scope)) {
    return { ok: false, error: 'scope must be "read" or "read write"' }
  }

  return {
    ok: true,
    request: { client, redirectUri, codeChallenge, scope, state: params.get('state') },
  }
}
