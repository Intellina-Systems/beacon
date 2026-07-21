import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { functionMembers, functions, members } from '@/lib/db/schema'
import { getWorkspaceContext, type WorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden } from '@/lib/auth/permissions'
import { canManageOrgUnit } from '@/lib/org/access'

async function findFunction(functionId: string, workspaceId: string) {
  const [fn] = await db
    .select({ id: functions.id, ownerMemberId: functions.ownerMemberId })
    .from(functions)
    .where(and(eq(functions.id, functionId), eq(functions.workspaceId, workspaceId)))
    .limit(1)
  return fn ?? null
}

type ManageCheck = { ok: true } | { ok: false; response: Response }

async function requireManage(ctx: WorkspaceContext, functionId: string): Promise<ManageCheck> {
  const fn = await findFunction(functionId, ctx.workspaceId)
  if (!fn) return { ok: false, response: Response.json({ error: 'Not found' }, { status: 404 }) }
  if (!canManageOrgUnit(ctx, fn)) return { ok: false, response: forbidden() }
  return { ok: true }
}

const putSchema = z.object({ memberId: z.string().min(1) })

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: functionId } = await params
  const result = await requireManage(ctx, functionId)
  if (!result.ok) return result.response

  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, parsed.data.memberId), eq(members.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!member) return Response.json({ error: 'Member not found' }, { status: 404 })

  const [row] = await db
    .insert(functionMembers)
    .values({ id: nanoid(), functionId, memberId: parsed.data.memberId })
    .onConflictDoNothing()
    .returning()

  return Response.json({ functionMember: row ?? { functionId, memberId: parsed.data.memberId } })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: functionId } = await params
  const result = await requireManage(ctx, functionId)
  if (!result.ok) return result.response

  const memberId = new URL(req.url).searchParams.get('memberId')
  if (!memberId) return Response.json({ error: 'memberId is required' }, { status: 400 })

  await db
    .delete(functionMembers)
    .where(and(eq(functionMembers.functionId, functionId), eq(functionMembers.memberId, memberId)))
  return Response.json({ success: true })
}
