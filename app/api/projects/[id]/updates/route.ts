import { and, desc, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { members, projectUpdates, projects, PROJECT_HEALTH } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ingestEvents } from '@/lib/events/ingest'
import { isUpdateStale } from '@/lib/projects/health'
import { generateId } from '@/lib/utils/id'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const updates = await db
    .select({
      id: projectUpdates.id,
      health: projectUpdates.health,
      body: projectUpdates.body,
      authorMemberId: projectUpdates.authorMemberId,
      authorName: members.name,
      createdAt: projectUpdates.createdAt,
    })
    .from(projectUpdates)
    .leftJoin(members, eq(members.id, projectUpdates.authorMemberId))
    .where(eq(projectUpdates.projectId, id))
    .orderBy(desc(projectUpdates.createdAt))
    .limit(50)

  return Response.json({ updates, stale: isUpdateStale(updates[0]?.createdAt ?? null) })
}

const createSchema = z.object({
  health: z.enum(PROJECT_HEALTH),
  body: z.string().min(1).max(5000),
})

// Any workspace member can post an update — matches Linear (lead/owner
// first, then anyone); this app has no per-project ownership to gate on.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid update', issues: parsed.error.issues }, { status: 400 })

  const { id } = await params
  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

  const [update] = await db
    .insert(projectUpdates)
    .values({
      id: generateId(),
      workspaceId: ctx.workspaceId,
      projectId: id,
      health: parsed.data.health,
      body: parsed.data.body,
      authorMemberId: ctx.member.id,
    })
    .returning()

  await ingestEvents(
    [
      {
        type: 'project.update_posted',
        source: 'manual',
        summary: `${ctx.member.name} posted a ${parsed.data.health.replace('_', ' ')} update on ${project.name}`,
        engineer: ctx.member.name,
        payload: { projectId: id, health: parsed.data.health },
      },
    ],
    { workspaceId: ctx.workspaceId },
  )

  return Response.json({ update }, { status: 201 })
}
