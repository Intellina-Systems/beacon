import { z } from 'zod'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { retrieveKnowledgeContext } from '@/lib/knowledge/retrieve'
import { getMcpAuth } from '../context'

const inputSchema = z.object({
  query: z.string().min(1).max(500),
})

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`
}

export function registerSearchKnowledgeTool(server: McpServer) {
  server.registerTool(
    'search_knowledge',
    {
      title: 'Search knowledge base',
      description:
        'Semantic search over ingested knowledge (meeting notes, docs, emails, links) and its extracted signals — decisions, requirements, blockers mentioned outside the trackers.',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      const auth = getMcpAuth(ctx)
      const context = await retrieveKnowledgeContext({
        workspaceId: auth.workspaceId,
        query: input.query,
        maxDocuments: 6,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              documents: context.documents.map((d) => ({
                title: d.title,
                sourceType: d.sourceType,
                summary: d.summary ?? truncate(d.content, 300),
                similarity: d.similarity,
              })),
              signals: context.signals.map((s) => ({
                kind: s.kind,
                title: s.title,
                detail: s.detail,
                confidence: s.confidence,
              })),
            }),
          },
        ],
      }
    },
  )
}
