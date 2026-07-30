import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ATTACHMENT_MAX_BYTES, listAttachments, storeAttachment } from '@/lib/work-items/attachments'

export const runtime = 'nodejs'

async function assertItem(workspaceId: string, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workItems.id })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, workspaceId)))
    .limit(1)
  return !!row
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await assertItem(ctx.workspaceId, id))) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ attachments: await listAttachments(ctx.workspaceId, id) })
}

// Multipart upload — one file per request, which is what a paste or a drop of
// a single screenshot produces. The client uploads first, then writes the
// returned URL into the markdown it is composing.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await assertItem(ctx.workspaceId, id))) return Response.json({ error: 'Not found' }, { status: 404 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return Response.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.size === 0) return Response.json({ error: 'File is empty' }, { status: 400 })
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return Response.json({ error: `File is larger than ${ATTACHMENT_MAX_BYTES / (1024 * 1024)}MB` }, { status: 413 })
  }

  const commentIdRaw = form?.get('commentId')
  const attachment = await storeAttachment({
    workspaceId: ctx.workspaceId,
    workItemId: id,
    commentId: typeof commentIdRaw === 'string' && commentIdRaw ? commentIdRaw : null,
    uploadedByMemberId: ctx.member.id,
    filename: file.name || 'upload',
    contentType: file.type,
    bytes: await file.arrayBuffer(),
  })

  return Response.json({ attachment }, { status: 201 })
}
