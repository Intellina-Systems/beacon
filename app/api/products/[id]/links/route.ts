import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { githubLinearLinks } from '@/lib/db/schema'
import { getUserProduct } from '@/lib/products/access'
import { getServerSession } from '@/lib/session/get-server-session'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const product = await getUserProduct(id, session.user.id)
  if (!product) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await req.json()) as {
    linkId?: string
    status?: 'accepted' | 'rejected'
  }

  if (!body.linkId || !body.status) {
    return Response.json({ error: 'Link and status are required' }, { status: 400 })
  }

  const [link] = await db
    .update(githubLinearLinks)
    .set({ status: body.status, updatedAt: new Date() })
    .where(and(eq(githubLinearLinks.id, body.linkId), eq(githubLinearLinks.productId, id)))
    .returning()

  if (!link) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ link })
}
