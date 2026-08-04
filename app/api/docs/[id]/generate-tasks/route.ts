import { type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { engines, members, projects, teams } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { resolveDocAccess } from '@/lib/docs/access'
import { blocksToMarkdown } from '@/lib/docs/markdown'
import { extractTasksFromContent, resolveExtractedTasks } from '@/lib/work-items/bulk-import'

// Extraction only — same "propose, never auto-create" restraint as
// /api/work-items/bulk-import: this returns resolved-but-uncreated task
// proposals, and nothing gets written until the review dialog's confirm
// posts the selected subset to the existing /api/work-items/bulk endpoint.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDocAccess(ctx, id)
  if (!access) return Response.json({ error: 'Not found' }, { status: 404 })
  if (access.permission !== 'edit') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const markdown = blocksToMarkdown(access.doc.content as unknown[])
  if (!markdown.trim()) return Response.json({ error: 'Nothing to extract tasks from yet' }, { status: 400 })

  const [roster, projectRows, engineRows, teamRows] = await Promise.all([
    db.select({ id: members.id, name: members.name }).from(members).where(eq(members.workspaceId, ctx.workspaceId)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.workspaceId, ctx.workspaceId)),
    db.select({ id: engines.id, name: engines.name }).from(engines).where(eq(engines.workspaceId, ctx.workspaceId)),
    db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.workspaceId, ctx.workspaceId)),
  ])

  const extracted = await extractTasksFromContent({
    content: markdown,
    roster: roster.map((m) => m.name),
    projects: projectRows.map((p) => p.name),
    engines: engineRows.map((e) => e.name),
    teams: teamRows.map((t) => t.name),
  }).catch(() => null)

  if (!extracted) return Response.json({ error: 'Could not extract tasks from this document' }, { status: 502 })
  if (extracted.length === 0) {
    return Response.json({ error: 'No actionable tasks found in this document' }, { status: 422 })
  }

  const tasks = resolveExtractedTasks(extracted, {
    roster,
    projects: projectRows,
    engines: engineRows,
    teams: teamRows,
  })

  return Response.json({ tasks, options: { members: roster, projects: projectRows } })
}
