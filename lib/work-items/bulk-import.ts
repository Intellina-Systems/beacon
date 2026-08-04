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

export interface NamedOption {
  id: string
  name: string
}

export interface ResolvedTask {
  title: string
  description: string | null
  kind: ExtractedTask['kind']
  priority: number
  labels: string[]
  dueDate: string | null
  estimate: number | null
  assigneeMemberId: string | null
  projectId: string | null
  engineId: string | null
  teamId: string | null
}

function matchByName(options: NamedOption[], name: string | null): string | null {
  if (!name) return null
  const needle = name.trim().toLowerCase()
  return options.find((o) => o.name.trim().toLowerCase() === needle)?.id ?? null
}

// Maps each extracted task's free-text assignee/project/engine/team names
// onto real workspace ids — shared by the bulk-import route and the docs
// /generate-tasks route so the "only set it when the name matches exactly"
// resolution rule lives in one place.
export function resolveExtractedTasks(
  extracted: ExtractedTask[],
  options: { roster: NamedOption[]; projects: NamedOption[]; engines: NamedOption[]; teams: NamedOption[] },
): ResolvedTask[] {
  return extracted.map((task) => ({
    title: task.title,
    description: task.description,
    kind: task.kind,
    priority: task.priority,
    labels: task.labels,
    dueDate: task.dueDate,
    estimate: task.estimate,
    assigneeMemberId: matchByName(options.roster, task.assigneeName),
    projectId: matchByName(options.projects, task.projectName),
    engineId: matchByName(options.engines, task.engineName),
    teamId: matchByName(options.teams, task.teamName),
  }))
}

export async function extractTasksFromContent(input: {
  content: string
  roster: string[]
  projects: string[]
  engines: string[]
  teams: string[]
}): Promise<ExtractedTask[]> {
  const { output } = await generateText({
    model: 'openai/gpt-5.6-luna',
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
