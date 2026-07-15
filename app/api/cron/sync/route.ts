import { type NextRequest } from 'next/server'
import { syncAllSources } from '@/lib/connectors'

export const maxDuration = 300

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production'
  }
  return req.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await syncAllSources()
    return Response.json({ success: true, ...summary })
  } catch (error) {
    console.error('[cron sync] failed:', error)
    return Response.json({ error: 'Cron sync failed' }, { status: 500 })
  }
}
