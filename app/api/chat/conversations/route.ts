import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { chatConversations } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

// No POST here — a conversation row is created implicitly by /api/chat's
// onFinish the first time a given conversationId (generated client-side)
// completes a turn. See lib/chat/persistence.ts.
export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      scope: chatConversations.scope,
      updatedAt: chatConversations.updatedAt,
    })
    .from(chatConversations)
    .where(and(eq(chatConversations.workspaceId, ctx.workspaceId), eq(chatConversations.memberId, ctx.member.id)))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(50)

  return Response.json({ conversations: rows })
}
