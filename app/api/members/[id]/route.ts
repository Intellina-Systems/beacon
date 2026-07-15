import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = (await req.json()) as {
    name?: string
    email?: string
    role?: string
    avatarUrl?: string
    githubUsername?: string | null
    linearUserId?: string | null
    slackHandle?: string | null
    aliases?: string[] | null
  }

  const updated = await db
    .update(members)
    .set({
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.email !== undefined && { email: body.email?.trim() ?? null }),
      ...(body.role !== undefined && { role: body.role?.trim() ?? null }),
      ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl?.trim() ?? null }),
      ...(body.githubUsername !== undefined && { githubUsername: body.githubUsername?.trim() ?? null }),
      ...(body.linearUserId !== undefined && { linearUserId: body.linearUserId ?? null }),
      ...(body.slackHandle !== undefined && { slackHandle: body.slackHandle?.trim() ?? null }),
      ...(body.aliases !== undefined && { aliases: body.aliases ?? null }),
      updatedAt: new Date(),
    })
    .where(and(eq(members.id, id), eq(members.userId, session.user.id)))
    .returning()

  if (!updated.length) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ member: updated[0] })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  await db.delete(members).where(and(eq(members.id, id), eq(members.userId, session.user.id)))

  return Response.json({ success: true })
}
