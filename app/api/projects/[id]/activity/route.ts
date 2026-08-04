import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { projects } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { gatherProjectActivity } from '@/lib/projects/health'

// Cheap, DB-only snapshot (status counts + recent event count, no LLM) — the
// data half of draftProjectUpdate, for callers that just want the numbers
// (the docs /project-status slash command) without paying for a narrative.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const activity = await gatherProjectActivity(ctx.workspaceId, project.id)
  return Response.json({ project: { id: project.id, name: project.name }, activity })
}
