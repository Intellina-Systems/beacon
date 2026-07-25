import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { CalendarError, setReminders } from '@/lib/calendar/mutations'
import type { ReminderSpec } from '@/lib/db/schema'

const schema = z.object({
  reminders: z
    .array(z.object({ method: z.enum(['popup', 'email']), minutesBefore: z.number().int().min(0).max(40320) }))
    .max(10),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid reminders' }, { status: 400 })

  try {
    await setReminders(ctx, id, parsed.data.reminders as ReminderSpec[])
    return Response.json({ ok: true })
  } catch (err) {
    if (err instanceof CalendarError) return Response.json({ error: err.message }, { status: err.status })
    throw err
  }
}
