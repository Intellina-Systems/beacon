import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.select().from(members).where(eq(members.workspaceId, ctx.workspaceId)).orderBy(members.name)

  return Response.json({ members: rows })
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(ctx)) return forbidden()

  const body = (await req.json()) as {
    name?: string
    email?: string
    title?: string
    githubUsername?: string
  }

  if (!body.name?.trim()) {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }

  const member = await db
    .insert(members)
    .values({
      id: nanoid(),
      workspaceId: ctx.workspaceId,
      name: body.name.trim(),
      email: body.email?.trim() ?? null,
      title: body.title?.trim() ?? null,
      githubUsername: body.githubUsername?.trim() ?? null,
    })
    .returning()

  return Response.json({ member: member[0] }, { status: 201 })
}
