import 'server-only'

import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { knowledgeDocuments, knowledgeSignals } from '@/lib/db/schema'
import { buildKnowledgeEmbeddingInput, embedKnowledgeText } from '@/lib/knowledge/embeddings'
import { extractKnowledgeSignals } from '@/lib/knowledge/extract-signals'

export type ExtractionStatus = 'complete' | 'stored_without_signals' | 'stored_without_summary'

export async function runKnowledgeExtraction(params: {
  documentId: string
  userId: string
  context?: string | null
  title: string
  content: string
  initialDocument: typeof knowledgeDocuments.$inferSelect
  /** When re-syncing an existing document, drop previously extracted signals before inserting fresh ones. */
  replaceSignals?: boolean
}): Promise<{
  document: typeof knowledgeDocuments.$inferSelect
  signals: (typeof knowledgeSignals.$inferSelect)[]
  extractionStatus: ExtractionStatus
}> {
  const { documentId, userId, context, title, content, replaceSignals } = params
  let document = params.initialDocument
  const now = new Date()

  const extraction = await extractKnowledgeSignals({ context, title, content }).catch(() => null)

  if (!extraction) {
    return { document, signals: [], extractionStatus: 'stored_without_signals' }
  }

  const embedding = await embedKnowledgeText(
    buildKnowledgeEmbeddingInput({ title, summary: extraction.summary, content }),
  ).catch(() => null)

  try {
    const [updatedDocument] = await db
      .update(knowledgeDocuments)
      .set({ summary: extraction.summary, updatedAt: new Date() })
      .where(eq(knowledgeDocuments.id, documentId))
      .returning()

    document = updatedDocument
  } catch {
    return { document, signals: [], extractionStatus: 'stored_without_summary' }
  }

  if (embedding) {
    try {
      const [updatedDocument] = await db
        .update(knowledgeDocuments)
        .set({ embedding, updatedAt: new Date() })
        .where(eq(knowledgeDocuments.id, documentId))
        .returning()

      document = updatedDocument
    } catch {
      // The source and extracted signals can still be useful without a retrieval embedding.
    }
  }

  try {
    if (replaceSignals) {
      await db.delete(knowledgeSignals).where(eq(knowledgeSignals.documentId, documentId))
    }

    const insertedSignals =
      extraction.signals.length > 0
        ? await db
            .insert(knowledgeSignals)
            .values(
              extraction.signals.map((signal) => ({
                id: nanoid(),
                userId,
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

    return { document, signals: insertedSignals, extractionStatus: 'complete' }
  } catch {
    return { document, signals: [], extractionStatus: 'stored_without_signals' }
  }
}
