import { type NextRequest } from 'next/server'
import { and, eq, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { knowledgeDocuments } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { runKnowledgeExtraction } from '@/lib/knowledge/ingest-pipeline'
import { UnreachableUrlError, UnsupportedContentError, fetchLinkContent } from '@/lib/knowledge/ingest-sources'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_KNOWLEDGE_CHARS = 20000
// Re-embedding calls an LLM per document, so cap a single pass. The UI reports
// what was covered and the user can run it again.
const MAX_DOCUMENTS_PER_RUN = 40

// Only these carry a live source worth re-fetching. Uploaded files (pdf, word,
// excel) have no canonical URL to pull from — their stored text is the source.
const REFETCHABLE = new Set(['url', 'google_doc', 'google_sheet', 'notion', 'doc'])

const bodySchema = z
  .object({
    engineId: z.string().nullish(),
    teamId: z.string().nullish(),
  })
  .refine((v) => Boolean(v.engineId || v.teamId), {
    message: 'Provide engineId or teamId — refusing to re-ingest an entire workspace in one call',
  })

// Re-reads every document tagged to a team or engine: re-fetches anything with
// a live URL, then re-summarises, re-embeds, and replaces its signals. This is
// what the "refresh into chat" button calls before opening chat, so answers
// reflect sources that changed outside Beacon.
export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid scope', issues: parsed.error.issues }, { status: 400 })
  }

  const filters: SQL[] = [eq(knowledgeDocuments.workspaceId, ctx.workspaceId)]
  if (parsed.data.engineId) filters.push(eq(knowledgeDocuments.engineId, parsed.data.engineId))
  if (parsed.data.teamId) filters.push(eq(knowledgeDocuments.teamId, parsed.data.teamId))

  const documents = await db
    .select()
    .from(knowledgeDocuments)
    .where(and(...filters))
    .limit(MAX_DOCUMENTS_PER_RUN + 1)

  const truncated = documents.length > MAX_DOCUMENTS_PER_RUN
  const batch = truncated ? documents.slice(0, MAX_DOCUMENTS_PER_RUN) : documents

  let refreshed = 0
  let refetched = 0
  const failures: { id: string; title: string; reason: string }[] = []

  // Sequential on purpose: each document costs an extraction + embedding call,
  // and firing them in parallel trips provider rate limits.
  for (const doc of batch) {
    let content = doc.content
    let title = doc.title

    if (doc.sourceUrl && REFETCHABLE.has(doc.sourceType)) {
      try {
        const fetched = await fetchLinkContent(doc.sourceUrl)
        if (fetched.text.trim()) {
          content = fetched.text.slice(0, MAX_KNOWLEDGE_CHARS)
          if (fetched.title?.trim()) title = fetched.title.trim()
          refetched += 1
        }
      } catch (error) {
        // A dead link shouldn't stop the pass — keep the stored copy and
        // re-embed that, so the document stays searchable.
        failures.push({
          id: doc.id,
          title: doc.title,
          reason:
            error instanceof UnreachableUrlError
              ? 'Source URL unreachable'
              : error instanceof UnsupportedContentError
                ? 'Source content type not supported'
                : 'Could not re-fetch source',
        })
      }
    }

    const [stored] = await db
      .update(knowledgeDocuments)
      .set({ title, content, lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(knowledgeDocuments.id, doc.id))
      .returning()

    const result = await runKnowledgeExtraction({
      documentId: doc.id,
      workspaceId: ctx.workspaceId,
      title,
      content,
      initialDocument: stored ?? doc,
      replaceSignals: true,
    })

    if (result.extractionStatus === 'complete') refreshed += 1
    else failures.push({ id: doc.id, title: doc.title, reason: result.extractionStatus.replace(/_/g, ' ') })
  }

  return Response.json({
    scanned: batch.length,
    refreshed,
    refetched,
    truncated,
    failures,
  })
}
