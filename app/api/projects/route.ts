import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { projects, workItems } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      linearProjectId: projects.linearProjectId,
      linearTeamId: projects.linearTeamId,
      repoUrl: projects.repoUrl,
      clientVertical: projects.clientVertical,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      issueCount: sql<number>`(select count(*) from work_items where work_items.project_id = ${projects.id})`,
    })
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(projects.updatedAt)

  return Response.json({ projects: rows })
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    name?: string
    description?: string
    repoUrl?: string
    clientVertical?: string
  }

  if (!body.name?.trim()) {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }

  const project = await db
    .insert(projects)
    .values({
      id: nanoid(),
      userId: session.user.id,
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      repoUrl: body.repoUrl?.trim() ?? null,
      clientVertical: body.clientVertical?.trim() ?? null,
    })
    .returning()

  return Response.json({ project: project[0] }, { status: 201 })
}
