import { type NextRequest } from 'next/server'
import { syncStaleDocsToKnowledge } from '@/lib/docs/knowledge-sync'

export const maxDuration = 300

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${cronSecret}`
}

// Own route rather than a step inside /api/cron/intelligence — this does an
// LLM summarization + embedding call per stale doc (same cost profile as
// /api/knowledge/reingest, which is also its own route for the same reason),
// and stacking that onto intelligence's already-LLM-heavy insight generation
// risked contending for its 300s budget.
export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncStaleDocsToKnowledge()
    return Response.json({ success: true, ...result })
  } catch (error) {
    console.error('[cron docs-knowledge] failed:', error)
    return Response.json({ error: 'Docs knowledge sync failed' }, { status: 500 })
  }
}
