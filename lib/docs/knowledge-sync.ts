import 'server-only'

import { eq, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docs, knowledgeDocuments, type Doc } from '@/lib/db/schema'
import { runKnowledgeExtraction } from '@/lib/knowledge/ingest-pipeline'

// Flattens BlockNote's Block[] tree into plain text for search/embedding — a
// pure structural walk, not BlockNote's own markdown exporter (which needs a
// live editor instance; see the MCP doc-tools spike for that question). Good
// enough for search relevance; not meant to round-trip back into blocks.
export function extractDocText(blocks: unknown[]): string {
  const lines: string[] = []

  function walkInline(content: unknown): string {
    if (!Array.isArray(content)) return ''
    return content
      .map((node) => {
        if (node && typeof node === 'object' && 'text' in node) {
          const text = (node as { text?: unknown }).text
          if (typeof text === 'string') return text
        }
        return ''
      })
      .join('')
  }

  function walk(block: unknown): void {
    if (!block || typeof block !== 'object') return
    const b = block as { content?: unknown; children?: unknown[] }
    const text = walkInline(b.content)
    if (text.trim()) lines.push(text)
    if (Array.isArray(b.children)) for (const child of b.children) walk(child)
  }

  for (const block of blocks) walk(block)
  return lines.join('\n').trim()
}

// Keeps a doc's text mirrored into the workspace's shared knowledge index —
// gives the existing search_knowledge MCP tool and the Knowledge page's
// search the doc's content for free, with zero changes to either. Uses the
// doc's own id as the knowledgeDocuments row's id too — a natural 1:1 key,
// no extra column needed. LLM summarization + embedding cost real money and
// time, so this is never called from the autosave path — only from the
// hourly cron sweep below. Editing must never wait on an LLM call.
export async function syncDocToKnowledge(workspaceId: string, doc: Doc): Promise<void> {
  const content = extractDocText(doc.content as unknown[])
  if (!content) return // nothing worth indexing yet

  const now = new Date()
  const [existing] = await db
    .select({ id: knowledgeDocuments.id })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, doc.id))
    .limit(1)

  const [stored] = existing
    ? await db
        .update(knowledgeDocuments)
        .set({ title: doc.title || 'Untitled', content, lastSyncedAt: now, updatedAt: now })
        .where(eq(knowledgeDocuments.id, doc.id))
        .returning()
    : await db
        .insert(knowledgeDocuments)
        .values({
          id: doc.id,
          workspaceId,
          title: doc.title || 'Untitled',
          sourceType: 'doc',
          content,
          lastSyncedAt: now,
        })
        .returning()

  await runKnowledgeExtraction({
    documentId: doc.id,
    workspaceId,
    title: doc.title || 'Untitled',
    content,
    initialDocument: stored,
    replaceSignals: true,
  })
}

export interface DocKnowledgeSyncResult {
  synced: number
}

// LLM calls per tick, bounded — same spirit as app/api/knowledge/reingest's
// MAX_DOCUMENTS_PER_RUN. The hourly cron cadence itself is the throttle: a
// doc edited many times in an hour still only syncs once per tick.
const MAX_DOCS_PER_RUN = 20

// Cron entry point: every doc whose content changed since its last knowledge
// sync (or was never synced), oldest-stale-first, capped per tick.
export async function syncStaleDocsToKnowledge(): Promise<DocKnowledgeSyncResult> {
  const stale = await db
    .select({ doc: docs })
    .from(docs)
    .leftJoin(knowledgeDocuments, eq(knowledgeDocuments.id, docs.id))
    .where(or(isNull(knowledgeDocuments.id), sql`${docs.updatedAt} > ${knowledgeDocuments.lastSyncedAt}`))
    .orderBy(docs.updatedAt)
    .limit(MAX_DOCS_PER_RUN)

  // Sequential on purpose, same reasoning as reingest: parallel extraction
  // calls trip provider rate limits.
  let synced = 0
  for (const { doc } of stale) {
    await syncDocToKnowledge(doc.workspaceId, doc)
    synced += 1
  }

  return { synced }
}
