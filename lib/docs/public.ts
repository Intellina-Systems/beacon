import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docs } from '@/lib/db/schema'

export interface PublicDoc {
  title: string
  content: unknown[]
  updatedAt: Date
}

// Looked up by token alone, no workspace/session context — this is the
// unauthenticated public-link path, so it must only ever return the minimum
// needed to render the doc (never workspaceId, ownerMemberId, etc).
export async function getPublicDoc(token: string): Promise<PublicDoc | null> {
  if (!token) return null
  const [doc] = await db
    .select({ title: docs.title, content: docs.content, updatedAt: docs.updatedAt })
    .from(docs)
    .where(and(eq(docs.publicShareToken, token), eq(docs.publicShareEnabled, true)))
    .limit(1)
  return doc ?? null
}
