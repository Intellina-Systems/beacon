import { type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { engines, members, projects, teams } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { extractTasksFromContent } from '@/lib/work-items/bulk-import'

const requestSchema = z.object({ content: z.string().trim().min(1).max(20000) })

interface NamedOption {
  id: string
  name: string
}

function matchByName(options: NamedOption[], name: string | null): string | null {
  if (!name) return null
  const needle = name.trim().toLowerCase()
  return options.find((o) => o.name.trim().toLowerCase() === needle)?.id ?? null
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = requestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Paste some content to extract tasks from' }, { status: 400 })
  }

  const [roster, projectRows, engineRows, teamRows] = await Promise.all([
    db.select({ id: members.id, name: members.name }).from(members).where(eq(members.workspaceId, ctx.workspaceId)),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.workspaceId, ctx.workspaceId)),
    db.select({ id: engines.id, name: engines.name }).from(engines).where(eq(engines.workspaceId, ctx.workspaceId)),
    db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.workspaceId, ctx.workspaceId)),
  ])

  const extracted = await extractTasksFromContent({
    content: parsed.data.content,
    roster: roster.map((m) => m.name),
    projects: projectRows.map((p) => p.name),
    engines: engineRows.map((e) => e.name),
    teams: teamRows.map((t) => t.name),
  }).catch(() => null)

  if (!extracted) {
    return Response.json({ error: 'Could not extract tasks from that content' }, { status: 502 })
  }
  if (extracted.length === 0) {
    return Response.json({ error: 'No actionable tasks found in that content' }, { status: 422 })
  }

  const tasks = extracted.map((task) => ({
    title: task.title,
    description: task.description,
    kind: task.kind,
    priority: task.priority,
    labels: task.labels,
    dueDate: task.dueDate,
    estimate: task.estimate,
    assigneeMemberId: matchByName(roster, task.assigneeName),
    projectId: matchByName(projectRows, task.projectName),
    engineId: matchByName(engineRows, task.engineName),
    teamId: matchByName(teamRows, task.teamName),
  }))

  return Response.json({ tasks })
}
