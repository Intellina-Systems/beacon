import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { calendarShares, calendars } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

const schema = z.object({
  memberId: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  role: z.enum(['freeBusy', 'reader', 'writer', 'owner']).default('reader'),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const [cal] = await db
    .select()
    .from(calendars)
    .where(and(eq(calendars.id, id), eq(calendars.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!cal) return Response.json({ error: 'Not found' }, { status: 404 })
  if (cal.ownerMemberId !== ctx.member.id)
    return Response.json({ error: 'Only the owner can share this calendar' }, { status: 403 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || (!parsed.data.memberId && !parsed.data.email)) {
    return Response.json({ error: 'A member or email is required' }, { status: 400 })
  }

  await db
    .insert(calendarShares)
    .values({
      id: generateId(16),
      workspaceId: ctx.workspaceId,
      calendarId: id,
      sharedWithMemberId: parsed.data.memberId ?? null,
      sharedWithEmail: parsed.data.email ?? null,
      role: parsed.data.role,
    })
    .onConflictDoUpdate({
      target: [calendarShares.calendarId, calendarShares.sharedWithMemberId],
      set: { role: parsed.data.role },
    })

  return Response.json({ ok: true }, { status: 201 })
}
