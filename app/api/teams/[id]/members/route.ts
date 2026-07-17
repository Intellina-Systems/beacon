import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { members, teamMembers, teams } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'

async function teamInWorkspace(teamId: string, workspaceId: string): Promise<boolean> {
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.workspaceId, workspaceId)))
    .limit(1)
  return !!team
}

const putSchema = z.object({
  memberId: z.string().min(1),
  isLead: z.boolean().default(false),
})

// Add a member to the team (or update their lead flag if already on it).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const { id: teamId } = await params
  if (!(await teamInWorkspace(teamId, ctx.workspaceId))) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, parsed.data.memberId), eq(members.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!member) return Response.json({ error: 'Member not found' }, { status: 404 })

  const [row] = await db
    .insert(teamMembers)
    .values({ id: nanoid(), teamId, memberId: parsed.data.memberId, isLead: parsed.data.isLead })
    .onConflictDoUpdate({
      target: [teamMembers.teamId, teamMembers.memberId],
      set: { isLead: parsed.data.isLead },
    })
    .returning()

  return Response.json({ teamMember: row })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const memberId = new URL(req.url).searchParams.get('memberId')
  if (!memberId) return Response.json({ error: 'memberId is required' }, { status: 400 })

  const { id: teamId } = await params
  if (!(await teamInWorkspace(teamId, ctx.workspaceId))) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.memberId, memberId)))
  return Response.json({ success: true })
}
