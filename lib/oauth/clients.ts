import 'server-only'

import { customAlphabet } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { mcpOauthClients, type McpOauthClient } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'

// Public, non-secret identifiers — unlike api_keys/invites, a client_id isn't
// a credential, so it's generated plainly rather than hashed at rest (same
// as a GitHub OAuth App's client_id being visible in a repo's README).
const generateClientId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 24)

export class ClientRegistrationError extends Error {}

// A registered redirect target must be HTTPS, or the loopback exception CLI
// tools (Claude Code, local MCP inspectors) rely on — http://localhost or
// http://127.0.0.1 at any port — never a plain http:// URL to a real host.
function isAllowedRedirectUri(uri: string): boolean {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
}

// RFC 7591 Dynamic Client Registration. Deliberately unauthenticated — any
// MCP client can self-register on first connect, matching how Claude
// Code/Cursor expect to work — because registering grants zero data access
// by itself; real access only ever follows a member completing browser
// consent at /oauth/authorize. Callers should still rate-limit by IP.
export async function registerClient(input: {
  clientName: string
  redirectUris: string[]
}): Promise<{ clientId: string }> {
  const clientName = input.clientName.trim()
  if (!clientName) throw new ClientRegistrationError('client_name is required')
  if (input.redirectUris.length === 0) throw new ClientRegistrationError('At least one redirect_uri is required')
  if (!input.redirectUris.every(isAllowedRedirectUri)) {
    throw new ClientRegistrationError('redirect_uris must be https://, or http://localhost for local tools')
  }

  const clientId = generateClientId()
  await db.insert(mcpOauthClients).values({
    id: generateId(),
    clientId,
    clientName: clientName.slice(0, 200),
    redirectUris: input.redirectUris,
  })
  return { clientId }
}

export async function getClientByPublicId(clientId: string): Promise<McpOauthClient | null> {
  const [row] = await db.select().from(mcpOauthClients).where(eq(mcpOauthClients.clientId, clientId)).limit(1)
  return row ?? null
}
