import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { retrieveKnowledgeContext } from '@/lib/knowledge/retrieve'
import { truncate, type ChatToolContext } from './shared'

export function createSearchKnowledgeTool({ workspaceId, scope }: ChatToolContext) {
  return tool({
    description:
      'Semantic search over the ingested knowledge base (meeting notes, docs, emails, links) and its extracted signals. Use for questions about decisions, requirements, user needs, or anything discussed outside the code/work trackers.',
    inputSchema: zodSchema(z.object({ query: z.string().min(1).max(500) })),
    execute: async (input: { query: string }) => {
      const context = await retrieveKnowledgeContext({ workspaceId, query: input.query, maxDocuments: 6, scope })
      return {
        documents: context.documents.map((document) => ({
          title: document.title,
          sourceType: document.sourceType,
          summary: document.summary ?? truncate(document.content, 300),
          similarity: document.similarity,
        })),
        signals: context.signals.map((signal) => ({
          kind: signal.kind,
          title: signal.title,
          detail: signal.detail,
          confidence: signal.confidence,
        })),
      }
    },
  })
}
