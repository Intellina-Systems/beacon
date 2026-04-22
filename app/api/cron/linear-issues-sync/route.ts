import { type NextRequest } from 'next/server'
import { decrypt } from '@/lib/crypto'
import { db } from '@/lib/db/client'
import { linearConnections } from '@/lib/db/schema'
import { syncLinearIssuesForUser } from '@/lib/linear/sync-issues'

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production'
  }

  const authHeader = req.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const connections = await db.select().from(linearConnections)

    let usersSynced = 0
    let usersFailed = 0
    let issuesSynced = 0

    for (const connection of connections) {
      try {
        const accessToken = decrypt(connection.accessToken)
        const result = await syncLinearIssuesForUser(connection.userId, accessToken)
        usersSynced++
        issuesSynced += result.issuesSynced
      } catch (err) {
        usersFailed++
        console.error('[Linear Issues Cron] User sync failed:', err)
      }
    }

    return Response.json({
      success: true,
      usersSynced,
      usersFailed,
      issuesSynced,
      scannedConnections: connections.length,
    })
  } catch (err) {
    console.error('[Linear Issues Cron] Error occurred:', err)
    return Response.json({ error: 'Cron sync failed' }, { status: 500 })
  }
}
