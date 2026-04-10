import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { projects, workItems } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, session.user.id)))
    .limit(1)

  if (!project) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const items = await db.select().from(workItems).where(eq(workItems.projectId, id)).orderBy(workItems.updatedAt)

  return Response.json({ project, workItems: items })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, session.user.id)))

  return Response.json({ success: true })
}
