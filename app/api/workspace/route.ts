import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { workspaces } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'

const patchSchema = z.object({ name: z.string().min(1).max(100) })

export async function PATCH(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid name' }, { status: 400 })

  const [updated] = await db
    .update(workspaces)
    .set({ name: parsed.data.name.trim(), updatedAt: new Date() })
    .where(eq(workspaces.id, ctx.workspaceId))
    .returning({ id: workspaces.id, name: workspaces.name })

  return Response.json({ workspace: updated })
}
