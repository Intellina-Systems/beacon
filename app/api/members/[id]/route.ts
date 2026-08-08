import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { ACCESS_ROLES, members, type AccessRole } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin, isSuperadmin } from '@/lib/auth/permissions'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(ctx)) return forbidden()

  const { id } = await params
  const body = (await req.json()) as {
    name?: string
    email?: string
    title?: string
    accessRole?: AccessRole
    avatarUrl?: string
    githubUsername?: string | null
    slackHandle?: string | null
    aliases?: string[] | null
  }

  // Granting or revoking superadmin is a step above what a plain admin may
  // do — otherwise any admin could mint (or demote) a superadmin through
  // this endpoint, defeating the point of the extra tier.
  if (body.accessRole !== undefined && ACCESS_ROLES.includes(body.accessRole)) {
    const [target] = await db
      .select({ accessRole: members.accessRole })
      .from(members)
      .where(and(eq(members.id, id), eq(members.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!target) return Response.json({ error: 'Not found' }, { status: 404 })

    const grantingSuperadmin = body.accessRole === 'superadmin' && target.accessRole !== 'superadmin'
    const revokingSuperadmin = body.accessRole !== 'superadmin' && target.accessRole === 'superadmin'
    if ((grantingSuperadmin || revokingSuperadmin) && !isSuperadmin(ctx)) {
      return forbidden('Only a superadmin can grant or revoke superadmin access')
    }
  }

  // People instinctively type "@handle" into a field labeled "username" —
  // strip one leading @ so it still matches a bare login/handle emitted by
  // GitHub or Slack events.
  const stripAt = (value: string): string => (value.startsWith('@') ? value.slice(1) : value)

  const updated = await db
    .update(members)
    .set({
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.email !== undefined && { email: body.email?.trim() ?? null }),
      ...(body.title !== undefined && { title: body.title?.trim() ?? null }),
      ...(body.accessRole !== undefined && ACCESS_ROLES.includes(body.accessRole) && { accessRole: body.accessRole }),
      ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl?.trim() ?? null }),
      ...(body.githubUsername !== undefined && {
        githubUsername: body.githubUsername ? stripAt(body.githubUsername.trim()) : null,
      }),
      ...(body.slackHandle !== undefined && {
        slackHandle: body.slackHandle ? stripAt(body.slackHandle.trim()) : null,
      }),
      ...(body.aliases !== undefined && {
        aliases: body.aliases ? body.aliases.map((a) => a.trim()).filter(Boolean) : null,
      }),
      updatedAt: new Date(),
    })
    .where(and(eq(members.id, id), eq(members.workspaceId, ctx.workspaceId)))
    .returning()

  if (!updated.length) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ member: updated[0] })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(ctx)) return forbidden()

  const { id } = await params

  // Same rule as the PATCH revoke guard above: deleting a superadmin's
  // membership removes their access just as surely as demoting them would,
  // so a plain admin can't use DELETE to route around that check.
  const [target] = await db
    .select({ accessRole: members.accessRole })
    .from(members)
    .where(and(eq(members.id, id), eq(members.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!target) return Response.json({ error: 'Not found' }, { status: 404 })
  if (target.accessRole === 'superadmin' && !isSuperadmin(ctx)) {
    return forbidden('Only a superadmin can remove a superadmin')
  }

  await db.delete(members).where(and(eq(members.id, id), eq(members.workspaceId, ctx.workspaceId)))

  return Response.json({ success: true })
}
