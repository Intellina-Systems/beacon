import { type NextRequest } from 'next/server'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { isAdmin } from '@/lib/auth/permissions'
import { getGrantOwner, revokeGrant } from '@/lib/oauth/grants'

// Shared by the self-serve "Disconnect" button on a member's own page and
// the admin oversight table on /integrations — a member may revoke only
// their own MCP connection; an admin may revoke any in the workspace, the
// same split GitHub/Slack apply between "your OAuth apps" and org admin oversight.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const owner = await getGrantOwner(ctx.workspaceId, id)
  if (!owner) return Response.json({ error: 'Not found' }, { status: 404 })
  if (owner.memberId !== ctx.member.id && !isAdmin(ctx)) {
    return Response.json({ error: 'Only the connection owner or an admin can revoke it' }, { status: 403 })
  }

  const revoked = await revokeGrant(ctx.workspaceId, id)
  if (!revoked) return Response.json({ error: 'Already revoked' }, { status: 404 })

  return Response.json({ success: true })
}
