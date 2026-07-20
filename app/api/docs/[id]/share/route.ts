import { type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { docCollaborators, docs, members, DOC_PERMISSIONS, DOC_SHARE_MODES } from '@/lib/db/schema'
import { getWorkspaceContext, type WorkspaceContext } from '@/lib/auth/workspace-context'
import { resolveDocAccess, type DocAccess } from '@/lib/docs/access'
import { generateId } from '@/lib/utils/id'

const generalAccessSchema = z.object({
  shareMode: z.enum(DOC_SHARE_MODES).optional(),
  workspacePermission: z.enum(DOC_PERMISSIONS).optional(),
})

const addCollaboratorSchema = z.object({
  memberId: z.string(),
  permission: z.enum(DOC_PERMISSIONS),
})

type OwnerCheck = { ok: true; access: DocAccess; ctx: WorkspaceContext } | { ok: false; response: Response }

// Sharing settings are owner-only — the person a doc belongs to is the only
// one who decides who else gets in, same as Notion/Google Docs "only you can
// share this" default for privately-owned files.
async function requireOwner(id: string): Promise<OwnerCheck> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const access = await resolveDocAccess(ctx, id)
  if (!access) return { ok: false, response: Response.json({ error: 'Not found' }, { status: 404 }) }
  if (!access.isOwner)
    return { ok: false, response: Response.json({ error: 'Only the owner can manage sharing' }, { status: 403 }) }
  return { ok: true, access, ctx }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  const result = await requireOwner(id)
  if (!result.ok) return result.response

  const collaborators = await db
    .select({
      memberId: docCollaborators.memberId,
      name: members.name,
      avatarUrl: members.avatarUrl,
      permission: docCollaborators.permission,
    })
    .from(docCollaborators)
    .innerJoin(members, eq(docCollaborators.memberId, members.id))
    .where(eq(docCollaborators.docId, id))
    .orderBy(members.name)

  return Response.json({
    shareMode: result.access.doc.shareMode,
    workspacePermission: result.access.doc.workspacePermission,
    collaborators,
  })
}

// Updates general access (private vs. workspace-wide + its permission).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  const result = await requireOwner(id)
  if (!result.ok) return result.response

  const parsed = generalAccessSchema.safeParse(await req.json())
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const [updated] = await db.update(docs).set(parsed.data).where(eq(docs.id, id)).returning()
  return Response.json({ doc: updated })
}

// Adds a collaborator, or updates their permission if already added (upsert).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  const result = await requireOwner(id)
  if (!result.ok) return result.response

  const parsed = addCollaboratorSchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })
  if (parsed.data.memberId === result.access.doc.ownerMemberId) {
    return Response.json({ error: 'The owner already has full access' }, { status: 400 })
  }

  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.id, parsed.data.memberId))
    .limit(1)
  if (!member) return Response.json({ error: 'Member not found' }, { status: 404 })

  const [collaborator] = await db
    .insert(docCollaborators)
    .values({
      id: generateId(),
      docId: id,
      memberId: parsed.data.memberId,
      permission: parsed.data.permission,
      addedByMemberId: result.ctx.member.id,
    })
    .onConflictDoUpdate({
      target: [docCollaborators.docId, docCollaborators.memberId],
      set: { permission: parsed.data.permission },
    })
    .returning()

  return Response.json({ collaborator }, { status: 201 })
}
