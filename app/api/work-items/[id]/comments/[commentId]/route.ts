import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { isAdmin } from '@/lib/auth/permissions'
import { deleteComment, getComment, updateComment } from '@/lib/work-items/comments'

const patchSchema = z.object({ body: z.string().trim().min(1).max(20000) })

// Comments are the author's words: only they may rewrite them. Admins may
// remove one, but never edit it into something the author did not write.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Comment cannot be empty' }, { status: 400 })

  const { commentId } = await params
  const comment = await getComment(ctx.workspaceId, commentId)
  if (!comment) return Response.json({ error: 'Not found' }, { status: 404 })
  if (comment.authorMemberId !== ctx.member.id) {
    return Response.json({ error: 'Only the author can edit a comment' }, { status: 403 })
  }

  await updateComment(ctx.workspaceId, commentId, parsed.data.body)
  return Response.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { commentId } = await params
  const comment = await getComment(ctx.workspaceId, commentId)
  if (!comment) return Response.json({ error: 'Not found' }, { status: 404 })
  if (comment.authorMemberId !== ctx.member.id && !isAdmin(ctx)) {
    return Response.json({ error: 'Only the author or an admin can delete a comment' }, { status: 403 })
  }

  await deleteComment(ctx.workspaceId, commentId)
  return Response.json({ success: true })
}
