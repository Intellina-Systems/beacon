import { and, eq, inArray } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

const MAX_IDS = 100

/**
 * Bulk status lookup for work-item chips embedded in a doc. A chip stores a
 * snapshot of the item's key/title/status at insert time so the document still
 * renders offline and in exports; this endpoint refreshes the status so a chip
 * written weeks ago doesn't keep claiming an item is still `todo`.
 *
 * Batched deliberately: one request per doc, not one per chip.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const ids = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS)

  if (ids.length === 0) return Response.json({ statuses: {} })

  const rows = await db
    .select({ id: workItems.id, key: workItems.key, title: workItems.title, status: workItems.status })
    .from(workItems)
    .where(and(eq(workItems.workspaceId, ctx.workspaceId), inArray(workItems.id, ids)))

  const statuses: Record<string, { key: string | null; title: string; status: string }> = {}
  for (const row of rows) {
    statuses[row.id] = { key: row.key, title: row.title, status: row.status }
  }

  return Response.json({ statuses })
}
