import { type NextRequest } from 'next/server'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { deleteAttachment, getAttachmentSignedUrl } from '@/lib/work-items/attachments'

export const runtime = 'nodejs'

// Redirects signed-in members of the owning workspace to a short-lived
// signed URL for the underlying Supabase Storage object — attachment ids are
// unguessable but are still not a capability, so the workspace check is what
// actually gates access; the bucket itself is private.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const signedUrl = await getAttachmentSignedUrl(ctx.workspaceId, id)
  if (!signedUrl) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.redirect(signedUrl, 302)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await deleteAttachment(ctx.workspaceId, id))) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
