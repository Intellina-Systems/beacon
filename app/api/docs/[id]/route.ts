import { type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { docs } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { resolveDocAccess } from '@/lib/docs/access'
import { moveDoc } from '@/lib/docs/move'

const patchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    content: z.array(z.unknown()).optional(),
    // null moves the doc to top-level; omitted leaves parentId untouched.
    parentId: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Empty update' })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDocAccess(ctx, id)
  if (!access) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ doc: access.doc, permission: access.permission, isOwner: access.isOwner })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDocAccess(ctx, id)
  if (!access) return Response.json({ error: 'Not found' }, { status: 404 })
  if (access.permission !== 'edit') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })

  const { parentId, ...fields } = parsed.data

  if (parentId !== undefined) {
    const result = await moveDoc(ctx, id, parentId)
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  }

  if (Object.keys(fields).length === 0) {
    const [doc] = await db.select().from(docs).where(eq(docs.id, id)).limit(1)
    return Response.json({ doc })
  }

  const [updated] = await db
    .update(docs)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(docs.id, id))
    .returning()

  return Response.json({ doc: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDocAccess(ctx, id)
  if (!access) return Response.json({ error: 'Not found' }, { status: 404 })
  if (!access.isOwner) return Response.json({ error: 'Only the owner can delete this document' }, { status: 403 })

  await db.delete(docs).where(eq(docs.id, id))
  return Response.json({ ok: true })
}
