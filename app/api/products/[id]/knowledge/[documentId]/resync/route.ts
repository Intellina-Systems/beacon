import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { knowledgeDocuments } from '@/lib/db/schema'
import { runKnowledgeExtraction } from '@/lib/knowledge/ingest-pipeline'
import { UnreachableUrlError, UnsupportedContentError, fetchLinkContent } from '@/lib/knowledge/ingest-sources'
import { getUserProduct } from '@/lib/products/access'
import { getServerSession } from '@/lib/session/get-server-session'

export const runtime = 'nodejs'

const MAX_KNOWLEDGE_CHARS = 20000

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> },
): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, documentId } = await params
  const product = await getUserProduct(id, session.user.id)
  if (!product) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const [existing] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.id, documentId),
        eq(knowledgeDocuments.productId, id),
        eq(knowledgeDocuments.userId, session.user.id),
      ),
    )
    .limit(1)

  if (!existing) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (!existing.sourceUrl) {
    return Response.json({ error: 'This source has no link to re-sync from' }, { status: 400 })
  }

  let fetched: Awaited<ReturnType<typeof fetchLinkContent>>
  try {
    fetched = await fetchLinkContent(existing.sourceUrl)
  } catch (error) {
    const message =
      error instanceof UnreachableUrlError || error instanceof UnsupportedContentError
        ? error.message
        : 'Failed to re-fetch the linked source'
    return Response.json({ error: message }, { status: 400 })
  }

  const content = fetched.text.slice(0, MAX_KNOWLEDGE_CHARS)
  if (content.trim().length < 40) {
    return Response.json({ error: 'The linked source no longer has enough extractable text' }, { status: 400 })
  }

  const now = new Date()

  let document: typeof knowledgeDocuments.$inferSelect
  try {
    const [updated] = await db
      .update(knowledgeDocuments)
      .set({ content, lastSyncedAt: now, updatedAt: now })
      .where(eq(knowledgeDocuments.id, documentId))
      .returning()

    document = updated
  } catch {
    return Response.json({ error: 'Failed to update the knowledge source' }, { status: 500 })
  }

  const result = await runKnowledgeExtraction({
    documentId,
    productId: id,
    productName: product.name,
    productDescription: product.description,
    title: existing.title,
    content,
    initialDocument: document,
    replaceSignals: true,
  })

  return Response.json(result)
}
