import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { connections } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { getLinearProjects, getLinearTeams } from '@/lib/linear/client'
import { getServerSession } from '@/lib/session/get-server-session'

// Lists the Linear projects and teams available as signal sources.
export async function GET(): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, session.user.id), eq(connections.provider, 'linear')))
    .limit(1)
  const connection = rows[0]
  if (!connection) return Response.json({ error: 'Linear is not connected' }, { status: 400 })

  try {
    const accessToken = decrypt(connection.accessToken)
    const [projects, teams] = await Promise.all([getLinearProjects(accessToken), getLinearTeams(accessToken)])
    return Response.json({
      workspace: { id: connection.workspaceId, name: connection.workspaceName },
      projects,
      teams,
    })
  } catch {
    return Response.json({ error: 'Failed to load Linear workspace options' }, { status: 502 })
  }
}
