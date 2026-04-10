import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  await db.delete(members).where(and(eq(members.id, id), eq(members.userId, session.user.id)))

  return Response.json({ success: true })
}
