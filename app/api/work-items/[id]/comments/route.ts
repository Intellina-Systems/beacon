import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ingestEvents } from '@/lib/events/ingest'
import { createComment, listComments } from '@/lib/work-items/comments'
import { addWatchers } from '@/lib/work-items/watchers'

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
  const [item] = await db
    .select({ id: workItems.id, key: workItems.key, title: workItems.title })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!item) return Response.json({ error: 'Not found' }, { status: 404 })

  const comment = await createComment({
    workspaceId: ctx.workspaceId,
    workItemId: id,
    authorMemberId: ctx.member.id,
    body: parsed.data.body,
  })

  // Commenting subscribes you, then the event fans out to everyone else
  // watching — same path assignment and status changes take.
  await addWatchers(ctx.workspaceId, id, [{ memberId: ctx.member.id, reason: 'manual' }])
  await ingestEvents(
    [
      {
        type: 'task.commented',
        source: 'manual',
        summary: `${ctx.member.name} commented on ${item.key ?? item.title}`,
        task: id,
        engineer: ctx.member.name,
        externalId: `workitem:${id}:comment:${comment.id}`,
        payload: { commentId: comment.id },
      },
    ],
    { workspaceId: ctx.workspaceId },
  )

  const comments = await listComments(ctx.workspaceId, id)
  return Response.json({ comment: comments.find((c) => c.id === comment.id) ?? null, comments }, { status: 201 })
}
