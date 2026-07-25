import { z } from 'zod'
import { db } from '@/lib/db/client'
import { calendars } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ensurePrimaryCalendar, getVisibleCalendars } from '@/lib/calendar/queries'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Make sure the viewer has a primary calendar before listing.
  await ensurePrimaryCalendar(ctx)
  const visible = await getVisibleCalendars(ctx)

  return Response.json({
    calendars: visible.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      timezone: c.timezone,
      isPrimary: c.isPrimary,
      visibility: c.visibility,
      mine: c.ownerMemberId === ctx.member.id,
      externalProvider: c.externalProvider,
      readOnly: Boolean(c.externalProvider),
    })),
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  color: z.string().max(20).default('#3b82f6'),
  timezone: z.string().min(1).default('UTC'),
  visibility: z.enum(['private', 'workspace']).default('private'),
})

export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })

  const [created] = await db
    .insert(calendars)
    .values({
      id: generateId(16),
      workspaceId: ctx.workspaceId,
      ownerMemberId: ctx.member.id,
      name: parsed.data.name,
      color: parsed.data.color,
      timezone: parsed.data.timezone,
      visibility: parsed.data.visibility,
    })
    .returning()

  return Response.json({ calendar: { id: created.id } }, { status: 201 })
}
