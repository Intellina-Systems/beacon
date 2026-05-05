import { type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { linearConnections } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { getServerSession } from '@/lib/session/get-server-session'
import { syncLinearIssuesForUser } from '@/lib/linear/sync-issues'

function isLinearUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('status 401')
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const [connection] = await db.select().from(linearConnections).where(eq(linearConnections.userId, userId)).limit(1)

  if (!connection) {
    return Response.json({ error: 'No Linear connection found' }, { status: 404 })
  }

  const accessToken = decrypt(connection.accessToken)

  try {
    const result = await syncLinearIssuesForUser(userId, accessToken, connection.workspaceId)

    return Response.json({
      success: true,
      issuesSynced: result.issuesSynced,
      buckets: result.buckets,
    })
  } catch (err) {
    if (isLinearUnauthorizedError(err)) {
      return Response.json({ error: 'Linear connection expired. Reconnect Linear.' }, { status: 401 })
    }

    console.error('[Linear Issues Sync] Error occurred')
    return Response.json({ error: 'Sync failed' }, { status: 500 })
  }
}
