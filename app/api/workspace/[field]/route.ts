import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { workspaces } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isSuperadmin } from '@/lib/auth/permissions'

const FIELDS = ['vision', 'mission'] as const
type Field = (typeof FIELDS)[number]

const patchSchema = z.object({ content: z.string().max(20000) })

// Shared PATCH for both statement fields — same shape, same guard, only the
// column differs. Superadmin-only to write (and, via the two pages, to read
// at all — there's no separate reader tier for these).
export async function PATCH(req: Request, { params }: { params: Promise<{ field: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperadmin(ctx)) return forbidden()

  const { field: rawField } = await params
  if (!FIELDS.includes(rawField as Field)) return Response.json({ error: 'Unknown field' }, { status: 404 })
  const field = rawField as Field

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid content' }, { status: 400 })

  const content = parsed.data.content.trim() || null

  if (field === 'vision') {
    const [updated] = await db
      .update(workspaces)
      .set({ vision: content, updatedAt: new Date() })
      .where(eq(workspaces.id, ctx.workspaceId))
      .returning({ vision: workspaces.vision })
    return Response.json({ vision: updated.vision })
  }

  const [updated] = await db
    .update(workspaces)
    .set({ mission: content, updatedAt: new Date() })
    .where(eq(workspaces.id, ctx.workspaceId))
    .returning({ mission: workspaces.mission })
  return Response.json({ mission: updated.mission })
}
