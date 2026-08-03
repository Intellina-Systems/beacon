import { type NextRequest } from 'next/server'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { linkActorToMember, LinkActorError } from '@/lib/members/link-actor'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const { id } = await params
  const body = (await req.json().catch(() => null)) as { actorLabel?: string } | null
  const actorLabel = body?.actorLabel?.trim()
  if (!actorLabel) {
    return Response.json({ error: 'actorLabel is required' }, { status: 400 })
  }

  try {
    await linkActorToMember(ctx.workspaceId, id, actorLabel)
  } catch (error) {
    if (error instanceof LinkActorError) return Response.json({ error: error.message }, { status: 404 })
    throw error
  }

  return Response.json({ success: true })
}
