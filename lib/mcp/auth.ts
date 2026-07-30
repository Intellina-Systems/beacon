import 'server-only'

import type { AuthInfo } from '@modelcontextprotocol/server'
import { verifyApiKey } from '@/lib/api-keys'
import { verifyMcpAccessToken } from './tokens'

// Passed to mcp-handler's withMcpAuth. Two credential shapes are accepted,
// so both "a proper connector" (OAuth-issued, member-scoped) and a manually
// pasted API key work through the same tool layer:
//
//  - An MCP access token (issued by the OAuth flow, lib/mcp/tokens.ts) —
//    carries a memberId, so tools reconstruct that person's real
//    WorkspaceContext and run through the same visibility/delegation checks
//    a session would.
//  - A legacy bcn_ key (lib/api-keys.ts) — workspace-scoped only, no member
//    identity. Read tools honour it with today's unrestricted-read behaviour;
//    write tools explicitly refuse it (see lib/mcp/context.ts
//    requireMemberContext) rather than inventing a synthetic member to
//    attribute a write to.
export async function verifyMcpToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined

  const mcpPayload = await verifyMcpAccessToken(bearerToken)
  if (mcpPayload) {
    return {
      token: bearerToken,
      clientId: mcpPayload.grantId,
      scopes: mcpPayload.scope.split(' ').filter(Boolean),
      extra: { memberId: mcpPayload.memberId, workspaceId: mcpPayload.workspaceId },
    }
  }

  const apiKey = await verifyApiKey(bearerToken)
  if (apiKey) {
    return {
      token: bearerToken,
      clientId: apiKey.keyId,
      scopes: ['read'],
      extra: { workspaceId: apiKey.workspaceId },
    }
  }

  return undefined
}
