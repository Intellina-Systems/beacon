import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.select().from(members).where(eq(members.userId, session.user.id)).orderBy(members.name)

  return Response.json({ members: rows })
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    name?: string
    email?: string
    role?: string
    githubUsername?: string
  }

  if (!body.name?.trim()) {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }

  const member = await db
    .insert(members)
    .values({
      id: nanoid(),
      userId: session.user.id,
      name: body.name.trim(),
      email: body.email?.trim() ?? null,
      role: body.role?.trim() ?? null,
      githubUsername: body.githubUsername?.trim() ?? null,
    })
    .returning()

  return Response.json({ member: member[0] }, { status: 201 })
}
