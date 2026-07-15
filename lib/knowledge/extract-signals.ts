import { openai } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { z } from 'zod'

const signalKindSchema = z.enum([
  'user_need',
  'pain_point',
  'feature_request',
  'blocker',
  'risk',
  'decision',
  'question',
])

const signalExtractionSchema = z.object({
  summary: z.string().describe('A concise summary of the ingested knowledge for an engineering team.'),
  signals: z
    .array(
      z.object({
        kind: signalKindSchema,
        title: z.string().describe('Short signal title.'),
        detail: z.string().describe('What the signal means for the team.'),
        evidence: z.string().nullable().describe('Short supporting quote or paraphrase from the source.'),
        confidence: z.number().int().min(1).max(5),
      }),
    )
    .max(8),
})

export type ExtractedKnowledgeSignal = z.infer<typeof signalExtractionSchema>['signals'][number]

export type KnowledgeSignalKind = z.infer<typeof signalKindSchema>

export async function extractKnowledgeSignals(input: { context?: string | null; title: string; content: string }) {
  const { output } = await generateText({
    model: openai('gpt-5.4-nano'),
    output: Output.object({ schema: signalExtractionSchema }),
    system:
      'You extract engineering-team signals from messy knowledge sources (meeting notes, docs, emails, chats). Return only grounded signals. Do not invent people, dates, commitments, or metrics. Prefer specific user needs, pain points, blockers, risks, decisions, open questions, and feature requests.',
    prompt: [
      input.context ? `Team context: ${input.context}` : null,
      `Source title: ${input.title}`,
      'Source content:',
      input.content,
    ]
      .filter(Boolean)
      .join('\n\n'),
  })

  return output
}
