import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { members, teamMembers, teams } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { canManageTeam } from '@/lib/org/access'

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

  const parsed = putSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const { id: teamId } = await params
  if (!(await canManageTeam(ctx, teamId))) return forbidden()

  if (!(await teamInWorkspace(teamId, ctx.workspaceId))) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Lead status is Admin-only in both directions: a Lead must not be able to
  // mint another Lead, nor demote a peer. Compare against the stored value so
  // an unchanged flag on an ordinary roster edit still passes.
  if (!isAdmin(ctx)) {
    const [current] = await db
      .select({ isLead: teamMembers.isLead })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.memberId, parsed.data.memberId)))
      .limit(1)
    const currentIsLead = current?.isLead ?? false
    if (currentIsLead !== parsed.data.isLead) {
      return forbidden('Only an admin can change who leads a team')
    }
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

  const memberId = new URL(req.url).searchParams.get('memberId')
  if (!memberId) return Response.json({ error: 'memberId is required' }, { status: 400 })

  const { id: teamId } = await params
  if (!(await canManageTeam(ctx, teamId))) return forbidden()

  if (!(await teamInWorkspace(teamId, ctx.workspaceId))) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Removing a Lead is a demotion by another name — keep it Admin-only so a
  // Lead can't drop a peer Lead off the team.
  if (!isAdmin(ctx)) {
    const [current] = await db
      .select({ isLead: teamMembers.isLead })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.memberId, memberId)))
      .limit(1)
    if (current?.isLead) return forbidden('Only an admin can remove a team lead')
  }

  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.memberId, memberId)))
  return Response.json({ success: true })
}
