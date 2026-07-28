import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
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

// Org scope for retrieval. Omit both to search the whole workspace (the
// default chat behaviour); pass one to answer from a single team's or
// engine's documents, which is what the per-team SOP view does.
export interface KnowledgeScope {
  engineId?: string | null
  teamId?: string | null
}

function scopeFilters(scope: KnowledgeScope | undefined): SQL[] {
  const filters: SQL[] = []
  if (scope?.engineId) filters.push(eq(knowledgeDocuments.engineId, scope.engineId))
  if (scope?.teamId) filters.push(eq(knowledgeDocuments.teamId, scope.teamId))
  return filters
}

export async function retrieveKnowledgeContext(input: {
  workspaceId: string
  query: string
  maxDocuments?: number
  maxSignals?: number
  scope?: KnowledgeScope
}) {
  const maxDocuments = input.maxDocuments ?? 5
  const maxSignals = input.maxSignals ?? 20
  const queryText = input.query.trim()
  const scoped = scopeFilters(input.scope)

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
      .where(and(eq(knowledgeSignals.workspaceId, input.workspaceId), eq(knowledgeSignals.status, 'new')))
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
            .where(
              and(
                eq(knowledgeDocuments.workspaceId, input.workspaceId),
                sql`${knowledgeDocuments.embedding} is not null`,
                ...scoped,
              ),
            )
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
          .where(and(eq(knowledgeDocuments.workspaceId, input.workspaceId), ...scoped))
          .orderBy(desc(knowledgeDocuments.createdAt))
          .limit(maxDocuments),
  ])

  return { documents, signals }
}
