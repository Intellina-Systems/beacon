import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { visibleMemberIds } from '@/lib/auth/permissions'
import { verifyApiKey } from '@/lib/api-keys'
import { ingestEvents, rawEventSchema } from '@/lib/events/ingest'
import { listEvents } from '@/lib/events/queries'
import type { Event } from '@/lib/db/schema'

const ingestBodySchema = z.union([rawEventSchema, z.object({ events: z.array(rawEventSchema).min(1).max(100) })])

// Bearer keys act at workspace level (unrestricted); session viewers carry
// their role-based member visibility.
async function resolveCaller(
  req: NextRequest,
): Promise<{ workspaceId: string; visibleMemberIds: string[] | null } | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const verified = await verifyApiKey(authHeader.slice('Bearer '.length).trim())
    return verified ? { workspaceId: verified.workspaceId, visibleMemberIds: null } : null
  }
  const ctx = await getWorkspaceContext()
  if (!ctx) return null
  return { workspaceId: ctx.workspaceId, visibleMemberIds: await visibleMemberIds(ctx) }
}

// Event ingestion — the front door of the intelligence layer. Coding agents,
// CI pipelines, and plugins POST here with an API key; the UI posts with a
// session. Accepts a single event or { events: [...] }.
export async function POST(req: NextRequest): Promise<Response> {
  const caller = await resolveCaller(req)
  if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const workspaceId = caller.workspaceId

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ingestBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid event payload', issues: parsed.error.issues }, { status: 400 })
  }

  const rawEvents = 'events' in parsed.data ? parsed.data.events : [parsed.data]

  try {
    const result = await ingestEvents(rawEvents, { workspaceId, defaultSource: 'agent' })
    return Response.json(result, { status: 201 })
  } catch (error) {
    console.error('[events] ingest failed:', error)
    return Response.json({ error: 'Failed to ingest events' }, { status: 500 })
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  const caller = await resolveCaller(req)
  if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const workspaceId = caller.workspaceId

  const params = req.nextUrl.searchParams
  const sinceDays = params.get('sinceDays')
  const types = params.get('types')

  const rows = await listEvents(workspaceId, {
    sinceDays: sinceDays ? Number(sinceDays) : undefined,
    source: (params.get('source') as Event['source']) ?? undefined,
    memberId: params.get('memberId') ?? undefined,
    workItemId: params.get('workItemId') ?? undefined,
    types: types ? types.split(',') : undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    visibleMemberIds: caller.visibleMemberIds,
  })

  return Response.json({ events: rows })
}
