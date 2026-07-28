import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { ACCESS_ROLES, invites, members, teamMembers } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { generateInviteToken, hashInviteToken, INVITE_TTL_MS } from '@/lib/invites'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const invitedBy = alias(members, 'invited_by')

  const rows = await db
    .select({
      id: invites.id,
      memberId: invites.memberId,
      memberName: members.name,
      memberRole: members.accessRole,
      email: invites.email,
      invitedByName: invitedBy.name,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .innerJoin(members, eq(members.id, invites.memberId))
    .leftJoin(invitedBy, eq(invitedBy.id, invites.invitedByMemberId))
    .where(and(eq(invites.workspaceId, ctx.workspaceId), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
    .orderBy(desc(invites.createdAt))

  return Response.json({ invites: rows })
}

const createSchema = z.object({
  // Either invite an existing profile member…
  memberId: z.string().optional(),
  // …or create the member as part of the invite.
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  title: z.string().max(100).optional(),
  githubUsername: z.string().max(100).optional(),
  accessRole: z.enum(ACCESS_ROLES).default('engineer'),
  teams: z.array(z.object({ teamId: z.string(), isLead: z.boolean().default(false) })).default([]),
})

// Create (or reuse) a member with a predefined role + team assignments, and
// mint a one-time join link. The raw token is returned once — only its hash
// is stored.
export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid invite', issues: parsed.error.issues }, { status: 400 })
  const input = parsed.data

  let memberId: string
  if (input.memberId) {
    const [member] = await db
      .select({ id: members.id, authUserId: members.authUserId })
      .from(members)
      .where(and(eq(members.id, input.memberId), eq(members.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!member) return Response.json({ error: 'Member not found' }, { status: 404 })
    if (member.authUserId) return Response.json({ error: 'Member already has access' }, { status: 409 })
    memberId = member.id
    await db
      .update(members)
      .set({ accessRole: input.accessRole, status: 'invited', updatedAt: new Date() })
      .where(eq(members.id, memberId))
    // Revoke any previous outstanding invite for this member
    await db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.memberId, memberId), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
  } else {
    if (!input.name?.trim()) return Response.json({ error: 'Name is required' }, { status: 400 })
    memberId = nanoid()
    await db.insert(members).values({
      id: memberId,
      workspaceId: ctx.workspaceId,
      name: input.name.trim(),
      email: input.email ?? null,
      title: input.title?.trim() || null,
      githubUsername: input.githubUsername?.trim() || null,
      accessRole: input.accessRole,
      status: 'invited',
    })
  }

  if (input.teams.length > 0) {
    await db
      .insert(teamMembers)
      .values(input.teams.map((t) => ({ id: nanoid(), teamId: t.teamId, memberId, isLead: t.isLead })))
      .onConflictDoUpdate({
        target: [teamMembers.teamId, teamMembers.memberId],
        set: { isLead: sql`excluded.is_lead` },
      })
  }

  const token = generateInviteToken()
  const [invite] = await db
    .insert(invites)
    .values({
      id: nanoid(),
      workspaceId: ctx.workspaceId,
      memberId,
      email: input.email ?? null,
      tokenHash: hashInviteToken(token),
      invitedByMemberId: ctx.member.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning({ id: invites.id, expiresAt: invites.expiresAt })

  const url = `${new URL(req.url).origin}/join/${token}`
  return Response.json({ invite: { id: invite.id, memberId, url, expiresAt: invite.expiresAt } }, { status: 201 })
}
