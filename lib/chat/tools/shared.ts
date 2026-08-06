import 'server-only'

import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { workItems, type Member } from '@/lib/db/schema'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'
import type { Blocker } from '@/lib/events/queries'

/** Everything app/api/chat/route.ts already fetches once per request, shared
 * across every tool instead of each one re-querying it. */
export interface ChatToolContext {
  ctx: WorkspaceContext
  workspaceId: string
  visible: string[] | null
  roster: Member[]
  memberById: Map<string, Member>
  memberActivity: Map<string, { total: number; byCategory: Record<string, number> }>
  blockers: Blocker[]
  scope?: { engineId: string | null; teamId: string | null }
}

export function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`
}

/** Same lookup lib/mcp/tools/add-relation.ts, add-comment.ts, and
 * update-work-item.ts each duplicate inline — one copy here instead. */
export async function resolveWorkItemId(workspaceId: string, idOrKey: string): Promise<string | null> {
  const [row] = await db
    .select({ id: workItems.id })
    .from(workItems)
    .where(
      and(
        eq(workItems.workspaceId, workspaceId),
        or(eq(workItems.id, idOrKey), eq(workItems.key, idOrKey.toUpperCase())),
      ),
    )
    .limit(1)
  return row?.id ?? null
}
