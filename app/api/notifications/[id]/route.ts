import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { notifications } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

const patchSchema = z
  .object({
    read: z.boolean().optional(),
    snoozedUntil: z.coerce.date().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Empty update' })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid update', issues: parsed.error.issues }, { status: 400 })
  }

  const { id } = await params
  const { read, snoozedUntil } = parsed.data

  const [notification] = await db
    .update(notifications)
    .set({
      ...(read !== undefined ? { readAt: read ? new Date() : null } : {}),
      ...(snoozedUntil !== undefined ? { snoozedUntil } : {}),
    })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.memberId, ctx.member.id),
        eq(notifications.workspaceId, ctx.workspaceId),
      ),
    )
    .returning()

  if (!notification) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ notification })
}
