import 'server-only'

import type { ServerContext } from '@modelcontextprotocol/server'
import { getWorkspaceContextForMember, type WorkspaceContext } from '@/lib/auth/workspace-context'
import { visibleMemberIds } from '@/lib/auth/permissions'

export interface McpCallerAuth {
  // null for a bcn_-key caller — there's no member identity to attach to a write.
  memberId: string | null
  workspaceId: string
  scopes: string[]
}

// withMcpAuth attaches the resolved AuthInfo to the original platform
// Request object (mcp-handler's `declare global { interface Request { auth?: AuthInfo } }`),
// and ServerContext.http.req is that same Request — so this is the one path
// from a tool's execute() back to who's calling it.
export function getMcpAuth(ctx: ServerContext): McpCallerAuth {
  const auth = ctx.http?.req?.auth
  if (!auth) throw new Error('MCP tool invoked without a resolved auth context')
  const extra = auth.extra ?? {}
  return {
    memberId: typeof extra.memberId === 'string' ? extra.memberId : null,
    workspaceId: typeof extra.workspaceId === 'string' ? extra.workspaceId : '',
    scopes: auth.scopes,
  }
}

// Full member-scoped WorkspaceContext for a write tool — reconstructs exactly
// what a real session would have, so canRouteWorkItems/checkWorkItemDelegation/
// visibleMemberIds behave identically to the web UI. Throws a plain Error
// (caught by each tool and turned into an MCP isError result, never a 500)
// rather than returning null, since every write tool needs one unconditionally.
export async function requireMemberContext(ctx: ServerContext): Promise<WorkspaceContext> {
  const auth = getMcpAuth(ctx)
  if (!auth.memberId) {
    throw new Error('Write actions require a connected member — API keys are read-only over MCP')
  }
  const workspaceCtx = await getWorkspaceContextForMember(auth.memberId)
  if (!workspaceCtx) {
    throw new Error('This connection is no longer valid — the member may have been removed or deactivated')
  }
  return workspaceCtx
}

// Shared by every read tool that filters by assignee visibility (events,
// work items). A member-scoped MCP grant gets exactly the visibility that
// member's own session would; a bcn_-key caller keeps today's unrestricted
// (workspace-wide) behaviour, matching what that key already does over
// GET /api/events.
export async function resolveVisibleMemberIds(memberId: string | null): Promise<string[] | null> {
  if (!memberId) return null
  const ctx = await getWorkspaceContextForMember(memberId)
  if (!ctx) return [] // deactivated member — see nothing, not an error
  return visibleMemberIds(ctx)
}
