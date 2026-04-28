import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { products } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getUserProduct } from '@/lib/products/access'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const product = await getUserProduct(id, session.user.id)

  if (!product) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ product })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = (await req.json()) as {
    name?: string
    description?: string | null
    clientVertical?: string | null
  }

  if (body.name !== undefined && !body.name.trim()) {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }

  const [product] = await db
    .update(products)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      ...(body.clientVertical !== undefined ? { clientVertical: body.clientVertical?.trim() || null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.userId, session.user.id)))
    .returning()

  if (!product) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ product })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await db.delete(products).where(and(eq(products.id, id), eq(products.userId, session.user.id)))

  return Response.json({ success: true })
}
