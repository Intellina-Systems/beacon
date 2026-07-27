import { embed, gateway } from 'ai'

export const KNOWLEDGE_EMBEDDING_MODEL = 'openai/text-embedding-3-small'

export async function embedKnowledgeText(value: string) {
  const { embedding } = await embed({
    model: gateway.embeddingModel(KNOWLEDGE_EMBEDDING_MODEL),
    value,
  })

  return embedding
}

export function buildKnowledgeEmbeddingInput(input: { title: string; summary: string | null; content: string }) {
  return [input.title, input.summary, input.content].filter(Boolean).join('\n\n').slice(0, 12000)
}
