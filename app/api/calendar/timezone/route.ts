import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

const schema = z.object({ timezone: z.string().min(1).max(64) })

// Persist the signed-in member's IANA timezone (captured from the browser).
export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid timezone' }, { status: 400 })

  await db
    .update(members)
    .set({ timezone: parsed.data.timezone, updatedAt: new Date() })
    .where(eq(members.id, ctx.member.id))
  return Response.json({ ok: true })
}
