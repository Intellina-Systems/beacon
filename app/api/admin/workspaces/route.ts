import { count, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, workspaces } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { forbidden, isSuperAdminUser } from '@/lib/auth/permissions'

export async function GET(): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdminUser(session.user.id))) return forbidden()

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      issuePrefix: workspaces.issuePrefix,
      createdAt: workspaces.createdAt,
      memberCount: count(members.id),
    })
    .from(workspaces)
    .leftJoin(members, eq(members.workspaceId, workspaces.id))
    .groupBy(workspaces.id)
    .orderBy(workspaces.createdAt)

  return Response.json({ workspaces: rows })
}
