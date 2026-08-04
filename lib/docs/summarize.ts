import 'server-only'

import { generateText, Output } from 'ai'
import { z } from 'zod'

const summarySchema = z.object({
  summary: z.string().describe('A concise 2-4 sentence summary for someone who has not read the document.'),
})

// Same generateText + Output.object shape as lib/knowledge/extract-signals.ts —
// the one LLM call pattern this codebase already uses everywhere.
export async function summarizeDoc(input: { title: string; markdown: string }): Promise<string> {
  const { output } = await generateText({
    model: 'openai/gpt-5.6-luna',
    output: Output.object({ schema: summarySchema }),
    system:
      'You summarize internal engineering documents concisely and factually. Do not invent information not present in the source.',
    prompt: `Document title: ${input.title}\n\nDocument content:\n${input.markdown}`,
  })
  return output.summary
}
