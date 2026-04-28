import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { linearConnections, productLinearConnections } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { syncProductLinearIssues } from '@/lib/linear/sync-product-issues'
import { getUserProduct } from '@/lib/products/access'
import { getServerSession } from '@/lib/session/get-server-session'

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

  const [connection, attached] = await Promise.all([
    db.select().from(linearConnections).where(eq(linearConnections.userId, session.user.id)).limit(1),
    db.select().from(productLinearConnections).where(eq(productLinearConnections.productId, id)),
  ])

  if (!connection[0]) {
    return Response.json({ connected: false, attached, availableProjects: [] })
  }

  const currentWorkspaceAttached = attached.filter(
    (attachment) => attachment.linearWorkspaceId === connection[0].workspaceId,
  )

  return Response.json({
    connected: true,
    workspaceName: connection[0].workspaceName ?? connection[0].workspaceSlug,
    workspaceId: connection[0].workspaceId,
    attached: currentWorkspaceAttached,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const product = await getUserProduct(id, session.user.id)
  if (!product) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: 'attach' | 'sync'
  }

  const [connection] = await db
    .select()
    .from(linearConnections)
    .where(eq(linearConnections.userId, session.user.id))
    .limit(1)
  if (!connection) {
    return Response.json({ error: 'No Linear connection found' }, { status: 404 })
  }

  const accessToken = decrypt(connection.accessToken)

  if (body.action === 'sync') {
    const result = await syncProductLinearIssues(session.user.id, id, accessToken)
    return Response.json({ success: true, ...result })
  }

  const [attached] = await db
    .insert(productLinearConnections)
    .values({
      id: nanoid(),
      productId: id,
      linearWorkspaceId: connection.workspaceId,
    })
    .onConflictDoUpdate({
      target: productLinearConnections.productId,
      set: {
        linearWorkspaceId: connection.workspaceId,
        linearProjectId: null,
        linearProjectName: null,
        linearTeamId: null,
        linearTeamName: null,
        syncEnabled: true,
        updatedAt: new Date(),
      },
    })
    .returning()

  return Response.json({ attached }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const product = await getUserProduct(id, session.user.id)
  if (!product) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const connectionId = req.nextUrl.searchParams.get('connectionId')
  if (!connectionId) {
    return Response.json({ error: 'Connection is required' }, { status: 400 })
  }

  await db
    .delete(productLinearConnections)
    .where(and(eq(productLinearConnections.id, connectionId), eq(productLinearConnections.productId, id)))

  return Response.json({ success: true })
}
