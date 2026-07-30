import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { CommentError, listComments, postComment } from '@/lib/work-items/comments'

const createSchema = z.object({ body: z.string().trim().min(1).max(20000) })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  return Response.json({ comments: await listComments(ctx.workspaceId, id) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Comment cannot be empty' }, { status: 400 })

  const { id } = await params
  try {
    const { comment, comments } = await postComment({
      workspaceId: ctx.workspaceId,
      workItemId: id,
      authorMemberId: ctx.member.id,
      authorName: ctx.member.name,
      body: parsed.data.body,
    })
    return Response.json({ comment, comments }, { status: 201 })
  } catch (error) {
    if (error instanceof CommentError) return Response.json({ error: error.message }, { status: 404 })
    throw error
  }
}
