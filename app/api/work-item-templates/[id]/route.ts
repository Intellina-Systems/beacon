import { and, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { workItemTemplates, WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

const defaultsSchema = z.object({
  title: z.string().max(300).optional(),
  description: z.string().max(10000).optional(),
  kind: z.enum(WORK_ITEM_KINDS).optional(),
  status: z.enum(WORK_ITEM_STATUSES).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  labels: z.array(z.string()).max(20).optional(),
  estimate: z.number().min(0).max(1000).optional(),
  assigneeMemberId: z.string().optional(),
  projectId: z.string().optional(),
})

const patchSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    defaults: defaultsSchema.optional(),
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
  const [template] = await db
    .update(workItemTemplates)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(workItemTemplates.id, id), eq(workItemTemplates.workspaceId, ctx.workspaceId)))
    .returning()

  if (!template) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ template })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [deleted] = await db
    .delete(workItemTemplates)
    .where(and(eq(workItemTemplates.id, id), eq(workItemTemplates.workspaceId, ctx.workspaceId)))
    .returning({ id: workItemTemplates.id })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
