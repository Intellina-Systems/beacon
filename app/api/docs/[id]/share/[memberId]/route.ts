import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { docCollaborators, DOC_PERMISSIONS } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { resolveDocAccess } from '@/lib/docs/access'

const patchSchema = z.object({ permission: z.enum(DOC_PERMISSIONS) })

type OwnerCheck = { ok: true } | { ok: false; response: Response }

async function requireOwner(id: string): Promise<OwnerCheck> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const access = await resolveDocAccess(ctx, id)
  if (!access) return { ok: false, response: Response.json({ error: 'Not found' }, { status: 404 }) }
  if (!access.isOwner)
    return { ok: false, response: Response.json({ error: 'Only the owner can manage sharing' }, { status: 403 }) }
  return { ok: true }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
): Promise<Response> {
  const { id, memberId } = await params
  const result = await requireOwner(id)
  if (!result.ok) return result.response

  const parsed = patchSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const [updated] = await db
    .update(docCollaborators)
    .set({ permission: parsed.data.permission })
    .where(and(eq(docCollaborators.docId, id), eq(docCollaborators.memberId, memberId)))
    .returning()
  if (!updated) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ collaborator: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
): Promise<Response> {
  const { id, memberId } = await params
  const result = await requireOwner(id)
  if (!result.ok) return result.response

  await db.delete(docCollaborators).where(and(eq(docCollaborators.docId, id), eq(docCollaborators.memberId, memberId)))
  return Response.json({ ok: true })
}
