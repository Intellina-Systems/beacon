import { db } from '@/lib/db/client'
import { and, eq } from 'drizzle-orm'
import { workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { listDocsReferencingWorkItem } from '@/lib/docs/list'

/** Docs that reference this work item, scoped to what the viewer can open. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Confirm the item belongs to this workspace before spending a jsonpath scan
  // on every doc in it.
  const item = await db
    .select({ id: workItems.id })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, ctx.workspaceId)))
    .limit(1)

  if (item.length === 0) return Response.json({ error: 'Not found' }, { status: 404 })

  const docs = await listDocsReferencingWorkItem(ctx, id)
  return Response.json({ docs })
}
