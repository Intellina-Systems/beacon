import { asc, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { projects, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canManageWorkspaceConfig, forbidden } from '@/lib/auth/permissions'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      status: projects.status,
      itemCount: count(workItems.id),
    })
    .from(projects)
    .leftJoin(workItems, eq(workItems.projectId, projects.id))
    .where(eq(projects.workspaceId, ctx.workspaceId))
    .groupBy(projects.id)
    .orderBy(asc(projects.createdAt))

  return Response.json({ projects: rows })
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

// Admins and managers can create projects.
export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageWorkspaceConfig(ctx)) return forbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid project', issues: parsed.error.issues }, { status: 400 })

  const [project] = await db
    .insert(projects)
    .values({ id: nanoid(), workspaceId: ctx.workspaceId, ...parsed.data })
    .onConflictDoNothing()
    .returning()

  if (!project) return Response.json({ error: 'A project with that name already exists' }, { status: 409 })
  return Response.json({ project }, { status: 201 })
}
