import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { findMeetingTimes } from '@/lib/calendar/free-busy'

const schema = z.object({
  memberIds: z.array(z.string()).min(1).max(50),
  durationMin: z.number().int().min(5).max(1440),
  rangeStart: z.string(),
  rangeEnd: z.string(),
  stepMinutes: z.number().int().min(5).max(240).optional(),
})

export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })

  const rangeStart = new Date(parsed.data.rangeStart)
  const rangeEnd = new Date(parsed.data.rangeEnd)
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return Response.json({ error: 'Invalid range' }, { status: 400 })
  }

  const slots = await findMeetingTimes({
    workspaceId: ctx.workspaceId,
    memberIds: parsed.data.memberIds,
    durationMin: parsed.data.durationMin,
    rangeStart,
    rangeEnd,
    stepMinutes: parsed.data.stepMinutes,
  })

  return Response.json({ suggestions: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })) })
}
