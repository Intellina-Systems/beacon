import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { insights } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

const patchSchema = z.object({ status: z.enum(['resolved', 'dismissed']) })

// Insights are informational, not access-controlled data — any member can
// dismiss/resolve one (personal or team curation, not a permission boundary).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid update', issues: parsed.error.issues }, { status: 400 })

  const { id } = await params
  const [insight] = await db
    .update(insights)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(insights.id, id), eq(insights.workspaceId, ctx.workspaceId)))
    .returning()

  if (!insight) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ insight })
}
