import { type NextRequest } from 'next/server'
import { desc, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { products } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      clientVertical: products.clientVertical,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      linearConnectionCount: sql<number>`(
        select count(*)
        from product_linear_connections
        inner join linear_connections
          on linear_connections.user_id = ${session.user.id}
         and linear_connections.workspace_id = product_linear_connections.linear_workspace_id
        where product_linear_connections.product_id = "products"."id"
      )::int`,
      githubRepositoryCount: sql<number>`(select count(*) from product_github_repositories where product_github_repositories.product_id = "products"."id")::int`,
    })
    .from(products)
    .where(eq(products.userId, session.user.id))
    .orderBy(desc(products.updatedAt))

  return Response.json({ products: rows })
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    name?: string
    description?: string
    clientVertical?: string
  }

  if (!body.name?.trim()) {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }

  const [product] = await db
    .insert(products)
    .values({
      id: nanoid(),
      userId: session.user.id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      clientVertical: body.clientVertical?.trim() || null,
    })
    .returning()

  return Response.json({ product }, { status: 201 })
}
