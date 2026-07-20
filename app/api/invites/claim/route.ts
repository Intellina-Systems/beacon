import { z } from 'zod'
import { getServerSession } from '@/lib/session/get-server-session'
import { claimInvite } from '@/lib/invites'
import { setActiveWorkspaceCookie } from '@/lib/workspace/active-workspace-cookie'

const claimSchema = z.object({ token: z.string().min(1) })

export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = claimSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const result = await claimInvite(parsed.data.token, session.user.id)
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 })

  // Land the user in the org they just joined, not whichever workspace their
  // cookie happened to point at (relevant the moment an account joins a
  // second org).
  await setActiveWorkspaceCookie(result.workspaceId)

  return Response.json({ success: true, workspaceId: result.workspaceId })
}
