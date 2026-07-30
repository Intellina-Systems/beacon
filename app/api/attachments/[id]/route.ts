import { type NextRequest } from 'next/server'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { deleteAttachment, isInlineContentType, readAttachmentBytes } from '@/lib/work-items/attachments'

export const runtime = 'nodejs'

// Serves attachment bytes to signed-in members of the owning workspace only —
// attachment ids are unguessable but are still not a capability, so the
// workspace check is what actually gates access.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const file = await readAttachmentBytes(ctx.workspaceId, id)
  if (!file) return Response.json({ error: 'Not found' }, { status: 404 })

  const inline = isInlineContentType(file.contentType)
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': inline ? file.contentType : 'application/octet-stream',
      'Content-Length': String(file.bytes.byteLength),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.filename)}"`,
      // Immutable: an attachment's bytes never change once uploaded.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await deleteAttachment(ctx.workspaceId, id))) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
