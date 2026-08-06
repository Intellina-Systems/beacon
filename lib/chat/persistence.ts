import 'server-only'

import { eq } from 'drizzle-orm'
import type { UIMessage } from 'ai'
import { db } from '@/lib/db/client'
import { chatConversations } from '@/lib/db/schema'

function truncateTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length <= 60 ? normalized : `${normalized.slice(0, 59)}…`
}

function messageId(message: unknown): string | undefined {
  return message && typeof message === 'object' && 'id' in message && typeof message.id === 'string'
    ? message.id
    : undefined
}

/** Appends this turn's user message (if any — a post-approval resend's last
 * incoming message is the assistant message being resolved, not a new user
 * turn) and the assistant's response onto `messages` by id: a fresh
 * response's id is new and gets appended, a post-approval resend's id
 * matches the still-pending message already in the array and overwrites it
 * in place instead of duplicating it. */
function mergeMessages(
  existing: unknown[],
  lastIncoming: UIMessage | undefined,
  responseMessage: UIMessage,
): unknown[] {
  let next = existing
  if (lastIncoming?.role === 'user' && !existing.some((m) => messageId(m) === lastIncoming.id)) {
    next = [...next, lastIncoming]
  }
  const responseIndex = next.findIndex((m) => messageId(m) === responseMessage.id)
  if (responseIndex === -1) {
    next = [...next, responseMessage]
  } else {
    next = next.map((m, i) => (i === responseIndex ? responseMessage : m))
  }
  return next
}

export async function persistTurn(args: {
  conversationId: string
  workspaceId: string
  memberId: string
  scope?: { engineId: string | null; teamId: string | null }
  firstUserText: string
  incomingMessages: UIMessage[]
  responseMessage: UIMessage
}): Promise<void> {
  const { conversationId, workspaceId, memberId, scope, firstUserText, incomingMessages, responseMessage } = args

  const [existing] = await db
    .select({ messages: chatConversations.messages, title: chatConversations.title })
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1)

  const lastIncoming = incomingMessages.at(-1)
  const messages = mergeMessages(existing?.messages ?? [], lastIncoming, responseMessage)
  // Only rename off the default the very first time this conversation is
  // actually persisted — never overwrite a title the user (or a later
  // rename) already set.
  const title = !existing || existing.title === 'New chat' ? truncateTitle(firstUserText) : existing.title

  await db
    .insert(chatConversations)
    .values({ id: conversationId, workspaceId, memberId, title, messages, scope, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: chatConversations.id,
      set: { messages, title, scope, updatedAt: new Date() },
    })
}
