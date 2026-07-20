import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { projects } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { draftProjectUpdate } from '@/lib/projects/health'

// Drafts an update from recent activity — never persists. The caller reviews
// and edits, then POSTs to /updates like any manually written one.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  try {
    const draft = await draftProjectUpdate(ctx.workspaceId, project)
    return Response.json({ draft })
  } catch (error) {
    console.error('[project update draft] failed:', error)
    return Response.json({ error: 'Failed to draft update' }, { status: 500 })
  }
}
