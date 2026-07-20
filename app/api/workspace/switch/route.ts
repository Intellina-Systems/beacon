import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { members, workspaces } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { setActiveWorkspaceCookie } from '@/lib/workspace/active-workspace-cookie'

const switchSchema = z.object({ workspaceId: z.string().min(1) })

// Switches the active workspace for accounts that belong to more than one
// (invited into a second org with the same login). Only ever moves the
// cookie to a workspace the caller is actually a member of.
export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = switchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const [membership] = await db
    .select({ workspaceId: workspaces.id, workspaceName: workspaces.name })
    .from(members)
    .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
    .where(and(eq(members.workspaceId, parsed.data.workspaceId), eq(members.authUserId, session.user.id)))
    .limit(1)

  if (!membership) return Response.json({ error: 'You are not a member of that workspace' }, { status: 403 })

  await setActiveWorkspaceCookie(membership.workspaceId)
  return Response.json({ success: true, workspaceId: membership.workspaceId, workspaceName: membership.workspaceName })
}
