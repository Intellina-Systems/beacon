import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { chatConversations } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.id, id),
        eq(chatConversations.workspaceId, ctx.workspaceId),
        eq(chatConversations.memberId, ctx.member.id),
      ),
    )
    .limit(1)

  // A brand-new, never-persisted conversation id (the client generates it
  // before the first message is even sent) is expected to 404 here — that's
  // not an error, it just means there's nothing to hydrate yet.
  if (!conversation) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({
    conversation: { id: conversation.id, title: conversation.title, scope: conversation.scope },
    messages: conversation.messages,
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const deleted = await db
    .delete(chatConversations)
    .where(
      and(
        eq(chatConversations.id, id),
        eq(chatConversations.workspaceId, ctx.workspaceId),
        eq(chatConversations.memberId, ctx.member.id),
      ),
    )
    .returning({ id: chatConversations.id })

  if (deleted.length === 0) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ ok: true })
}
