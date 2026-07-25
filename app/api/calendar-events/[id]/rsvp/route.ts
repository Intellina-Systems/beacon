import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { CalendarError, rsvp } from '@/lib/calendar/mutations'

const schema = z.object({ response: z.enum(['accepted', 'declined', 'tentative', 'needsAction']) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid response' }, { status: 400 })

  try {
    await rsvp(ctx, id, parsed.data.response)
    return Response.json({ ok: true })
  } catch (err) {
    if (err instanceof CalendarError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }
}
