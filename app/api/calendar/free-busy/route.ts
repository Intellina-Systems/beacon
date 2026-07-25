import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { getBusyIntervals } from '@/lib/calendar/free-busy'

export async function GET(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const membersParam = url.searchParams.get('members')
  const memberIds = membersParam ? membersParam.split(',').filter(Boolean) : []
  const start = new Date(url.searchParams.get('start') ?? '')
  const end = new Date(url.searchParams.get('end') ?? '')
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return Response.json({ error: 'Invalid start/end' }, { status: 400 })
  }

  const busy = await getBusyIntervals(ctx.workspaceId, memberIds, start, end)
  return Response.json({
    freeBusy: [...busy.entries()].map(([memberId, intervals]) => ({
      memberId,
      busy: intervals.map((i) => ({ start: i.start.toISOString(), end: i.end.toISOString() })),
    })),
  })
}
