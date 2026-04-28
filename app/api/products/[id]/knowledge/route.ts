import { type NextRequest } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { knowledgeDocuments, knowledgeSignals } from '@/lib/db/schema'
import { buildKnowledgeEmbeddingInput, embedKnowledgeText } from '@/lib/knowledge/embeddings'
import { extractKnowledgeSignals } from '@/lib/knowledge/extract-signals'
import { getUserProduct } from '@/lib/products/access'
import { getServerSession } from '@/lib/session/get-server-session'

export const runtime = 'nodejs'

const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_KNOWLEDGE_CHARS = 20000

const knowledgeSourceSchema = z.enum(['note', 'email', 'doc', 'pdf', 'whatsapp', 'other'])

const ingestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  sourceType: knowledgeSourceSchema.default('note'),
  content: z.string().trim().min(40).max(MAX_KNOWLEDGE_CHARS),
})

type KnowledgeIngestInput = z.infer<typeof ingestSchema>

function getPdfTitle(fileName: string) {
  const trimmed = fileName.trim()
  if (!trimmed) return 'PDF upload'

  return trimmed.replace(/\.pdf$/i, '').slice(0, 160) || 'PDF upload'
}

function normalizePdfText(value: string) {
  return value
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractPdfText(file: File) {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('PDF_TOO_LARGE')
  }

  const arrayBuffer = await file.arrayBuffer()
  const result = await pdfParse(Buffer.from(arrayBuffer))

  return normalizePdfText(result.text).slice(0, MAX_KNOWLEDGE_CHARS)
}

async function parseKnowledgeRequest(req: NextRequest): Promise<KnowledgeIngestInput | null> {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File) || file.type !== 'application/pdf') {
      return null
    }

    const content = await extractPdfText(file)
    const parsed = ingestSchema.safeParse({
      title: formData.get('title') || getPdfTitle(file.name),
      sourceType: 'pdf',
      content,
    })

    return parsed.success ? parsed.data : null
  }

  const parsed = ingestSchema.safeParse(await req.json())
  return parsed.success ? parsed.data : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const product = await getUserProduct(id, session.user.id)
  if (!product) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const [documents, signals] = await Promise.all([
    db
      .select()
      .from(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.productId, id), eq(knowledgeDocuments.userId, session.user.id)))
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(20),
    db
      .select()
      .from(knowledgeSignals)
      .where(eq(knowledgeSignals.productId, id))
      .orderBy(desc(knowledgeSignals.createdAt))
      .limit(50),
  ])

  return Response.json({ documents, signals })
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

  let knowledgeInput: KnowledgeIngestInput | null = null
  try {
    knowledgeInput = await parseKnowledgeRequest(req)
  } catch (error) {
    if (error instanceof Error && error.message === 'PDF_TOO_LARGE') {
      return Response.json({ error: 'PDF must be 10MB or smaller' }, { status: 400 })
    }

    return Response.json({ error: 'Invalid knowledge input' }, { status: 400 })
  }

  if (!knowledgeInput) {
    return Response.json({ error: 'Invalid knowledge input' }, { status: 400 })
  }

  const documentId = nanoid()
  const now = new Date()

  let document: typeof knowledgeDocuments.$inferSelect
  try {
    const [insertedDocument] = await db
      .insert(knowledgeDocuments)
      .values({
        id: documentId,
        productId: id,
        userId: session.user.id,
        title: knowledgeInput.title,
        sourceType: knowledgeInput.sourceType,
        content: knowledgeInput.content,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    document = insertedDocument
  } catch {
    return Response.json({ error: 'Knowledge source could not be saved' }, { status: 500 })
  }

  const extraction = await extractKnowledgeSignals({
    productName: product.name,
    productDescription: product.description,
    title: knowledgeInput.title,
    content: knowledgeInput.content,
  }).catch(() => null)

  if (!extraction) {
    return Response.json({ document, signals: [], extractionStatus: 'stored_without_signals' }, { status: 201 })
  }

  const embedding = await embedKnowledgeText(
    buildKnowledgeEmbeddingInput({
      title: knowledgeInput.title,
      summary: extraction.summary,
      content: knowledgeInput.content,
    }),
  ).catch(() => null)

  try {
    const [updatedDocument] = await db
      .update(knowledgeDocuments)
      .set({
        summary: extraction.summary,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocuments.id, documentId))
      .returning()

    document = updatedDocument
  } catch {
    return Response.json({ document, signals: [], extractionStatus: 'stored_without_summary' }, { status: 201 })
  }

  if (embedding) {
    try {
      const [updatedDocument] = await db
        .update(knowledgeDocuments)
        .set({
          embedding,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeDocuments.id, documentId))
        .returning()

      document = updatedDocument
    } catch {
      // The source and extracted signals can still be useful without a retrieval embedding.
    }
  }

  try {
    const insertedSignals =
      extraction.signals.length > 0
        ? await db
            .insert(knowledgeSignals)
            .values(
              extraction.signals.map((signal) => ({
                id: nanoid(),
                productId: id,
                documentId,
                kind: signal.kind,
                title: signal.title,
                detail: signal.detail,
                evidence: signal.evidence,
                confidence: signal.confidence,
                createdAt: now,
                updatedAt: now,
              })),
            )
            .returning()
        : []

    return Response.json({ document, signals: insertedSignals, extractionStatus: 'complete' }, { status: 201 })
  } catch {
    return Response.json({ document, signals: [], extractionStatus: 'stored_without_signals' }, { status: 201 })
  }
}
