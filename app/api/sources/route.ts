import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { signalSources, SIGNAL_SOURCE_KINDS } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { generateId } from '@/lib/utils/id'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const rows = await db
    .select()
    .from(signalSources)
    .where(eq(signalSources.workspaceId, ctx.workspaceId))
    .orderBy(desc(signalSources.createdAt))

  return Response.json({ sources: rows })
}

const createSchema = z.object({
  kind: z.enum(SIGNAL_SOURCE_KINDS),
  identifier: z.string().min(1).max(300),
  displayName: z.string().min(1).max(200),
  url: z.string().url().optional(),
  projectId: z.string().optional(),
})

export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid source', issues: parsed.error.issues }, { status: 400 })
  }

  const [source] = await db
    .insert(signalSources)
    .values({ id: generateId(), workspaceId: ctx.workspaceId, ...parsed.data })
    .onConflictDoUpdate({
      target: [signalSources.workspaceId, signalSources.kind, signalSources.identifier],
      set: { displayName: parsed.data.displayName, enabled: true, updatedAt: new Date() },
    })
    .returning()

  return Response.json({ source }, { status: 201 })
}
