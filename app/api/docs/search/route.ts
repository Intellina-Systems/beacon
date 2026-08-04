import { type NextRequest } from 'next/server'
import { and, eq, ilike, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { knowledgeDocuments } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { getVisibleDocs } from '@/lib/docs/tree'

export interface DocSearchResult {
  id: string
  title: string
  matchedIn: 'title' | 'content'
}

// Fast, simple substring search for the command palette — deliberately not
// the knowledgeDocuments embedding/semantic search (lib/knowledge/retrieve.ts):
// that's tuned for "answer a question from relevant context," this is tuned
// for "find the doc I'm thinking of, instantly, while typing." Title matches
// first, content matches (via the plain text already synced by
// lib/docs/knowledge-sync.ts) fill the rest.
export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return Response.json({ results: [] })

  const visible = await getVisibleDocs(ctx)
  const visibleIds = new Set(visible.map((d) => d.id))
  const needle = q.toLowerCase()

  const titleMatches: DocSearchResult[] = visible
    .filter((d) => (d.title || 'Untitled').toLowerCase().includes(needle))
    .slice(0, 20)
    .map((d) => ({ id: d.id, title: d.title || 'Untitled', matchedIn: 'title' as const }))

  const titleMatchedIds = new Set(titleMatches.map((r) => r.id))
  const remaining = 20 - titleMatches.length
  let contentMatches: DocSearchResult[] = []
  if (remaining > 0 && visibleIds.size > 0) {
    const rows = await db
      .select({ id: knowledgeDocuments.id, title: knowledgeDocuments.title })
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.workspaceId, ctx.workspaceId),
          eq(knowledgeDocuments.sourceType, 'doc'),
          inArray(knowledgeDocuments.id, [...visibleIds]),
          ilike(knowledgeDocuments.content, `%${q}%`),
        ),
      )
      .limit(remaining)
    contentMatches = rows.filter((r) => !titleMatchedIds.has(r.id)).map((r) => ({ ...r, matchedIn: 'content' as const }))
  }

  return Response.json({ results: [...titleMatches, ...contentMatches] })
}
