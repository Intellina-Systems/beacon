import 'server-only'

import { generateText, Output } from 'ai'
import { z } from 'zod'
import { WORK_ITEM_KINDS } from '@/lib/db/schema'

const extractedTaskSchema = z.object({
  title: z.string().describe('Short, action-oriented task title.'),
  description: z
    .string()
    .nullable()
    .describe('Supporting detail from the source, or null if the title is already self-explanatory.'),
  kind: z
    .enum(WORK_ITEM_KINDS)
    .describe('"epic" for a large multi-week initiative, "feature" for a shippable unit of work, else "task".'),
  priority: z.number().int().min(0).max(4).describe('0 none, 1 urgent, 2 high, 3 medium, 4 low.'),
  assigneeName: z
    .string()
    .nullable()
    .describe('Exact name from the known team members list this task should be assigned to, else null.'),
  projectName: z.string().nullable().describe('Exact name from the known projects list, else null.'),
  engineName: z.string().nullable().describe('Exact name from the known engines list, else null.'),
  teamName: z.string().nullable().describe('Exact name from the known teams list, else null.'),
  labels: z.array(z.string()).max(6),
  dueDate: z.string().nullable().describe('ISO date (YYYY-MM-DD) if a deadline is mentioned, else null.'),
  estimate: z.number().min(0).max(1000).nullable().describe('Effort/story-point estimate if mentioned, else null.'),
})

const bulkImportSchema = z.object({
  tasks: z.array(extractedTaskSchema).max(50),
})

export type ExtractedTask = z.infer<typeof extractedTaskSchema>

export async function extractTasksFromContent(input: {
  content: string
  roster: string[]
  projects: string[]
  engines: string[]
  teams: string[]
}): Promise<ExtractedTask[]> {
  const { output } = await generateText({
    model: 'openai/gpt-5.4-nano',
    output: Output.object({ schema: bulkImportSchema }),
    system: [
      'You extract actionable engineering tasks from pasted, unstructured text (meeting notes, chat logs, emails, specs).',
      'Return only genuinely actionable work items — skip status updates, FYIs, and general discussion.',
      'Split combined asks into separate tasks. Do not invent work that is not implied by the source.',
      input.roster.length ? `Known team members: ${input.roster.join(', ')}` : null,
      input.projects.length ? `Known projects: ${input.projects.join(', ')}` : null,
      input.engines.length ? `Known engines: ${input.engines.join(', ')}` : null,
      input.teams.length ? `Known teams: ${input.teams.join(', ')}` : null,
      'Only set assigneeName/projectName/engineName/teamName when the source clearly maps to one of the exact known names above; otherwise leave it null rather than guessing.',
    ]
      .filter(Boolean)
      .join('\n'),
    prompt: `Pasted content:\n\n${input.content}`,
  })

  return output.tasks
}
