import { and, desc, eq, sql } from 'drizzle-orm'
import { cosineDistance } from 'drizzle-orm/sql/functions'
import { db } from '@/lib/db/client'
import { knowledgeDocuments, knowledgeSignals } from '@/lib/db/schema'
import { embedKnowledgeText } from '@/lib/knowledge/embeddings'

export type KnowledgeSignalContextRow = {
  kind: string
  title: string
  detail: string
  evidence: string | null
  confidence: number
}

export async function retrieveKnowledgeContext(input: {
  userId: string
  query: string
  maxDocuments?: number
  maxSignals?: number
}) {
  const maxDocuments = input.maxDocuments ?? 5
  const maxSignals = input.maxSignals ?? 20
  const queryText = input.query.trim()

  const [signals, documents] = await Promise.all([
    db
      .select({
        kind: knowledgeSignals.kind,
        title: knowledgeSignals.title,
        detail: knowledgeSignals.detail,
        evidence: knowledgeSignals.evidence,
        confidence: knowledgeSignals.confidence,
      })
      .from(knowledgeSignals)
      .where(and(eq(knowledgeSignals.userId, input.userId), eq(knowledgeSignals.status, 'new')))
      .orderBy(desc(knowledgeSignals.createdAt))
      .limit(maxSignals),
    queryText
      ? embedKnowledgeText(queryText).then((embedding) =>
          db
            .select({
              id: knowledgeDocuments.id,
              title: knowledgeDocuments.title,
              sourceType: knowledgeDocuments.sourceType,
              summary: knowledgeDocuments.summary,
              content: knowledgeDocuments.content,
              similarity: sql<number>`1 - (${cosineDistance(knowledgeDocuments.embedding, embedding)})`,
            })
            .from(knowledgeDocuments)
            .where(and(eq(knowledgeDocuments.userId, input.userId), sql`${knowledgeDocuments.embedding} is not null`))
            .orderBy(cosineDistance(knowledgeDocuments.embedding, embedding))
            .limit(maxDocuments),
        )
      : db
          .select({
            id: knowledgeDocuments.id,
            title: knowledgeDocuments.title,
            sourceType: knowledgeDocuments.sourceType,
            summary: knowledgeDocuments.summary,
            content: knowledgeDocuments.content,
            similarity: sql<number>`0`,
          })
          .from(knowledgeDocuments)
          .where(eq(knowledgeDocuments.userId, input.userId))
          .orderBy(desc(knowledgeDocuments.createdAt))
          .limit(maxDocuments),
  ])

  return { documents, signals }
}
