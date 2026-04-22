import { streamText, tool, zodSchema, convertToModelMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { projects, members, linearConnections, linearIssues } from '@/lib/db/schema'
import { eq, sql, desc, and } from 'drizzle-orm'
import type { UIMessage } from 'ai'
import { getIssueBucket } from '@/lib/linear/issue-bucket'

const PRIORITY_LABEL: Record<number, string> = { 0: 'none', 1: 'urgent', 2: 'high', 3: 'medium', 4: 'low' }
const MAX_LINEAR_ISSUES_CONTEXT_ACTIVE = 30
const MAX_LINEAR_ISSUES_CONTEXT_IDEATION = 50

const LINEAR_CONTEXT_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'about',
  'into',
  'have',
  'what',
  'when',
  'where',
  'which',
  'would',
  'could',
  'should',
  'please',
  'current',
  'linear',
  'issues',
  'issue',
  'task',
  'tasks',
  'show',
  'list',
  'know',
])

type IssueContextMode = 'activeOnly' | 'includeCompleted'
type WorkItemsStatusFilter = 'all' | 'active' | 'urgent' | 'inProgress' | 'todo'

type LinearIssueContextRow = {
  identifier: string
  title: string
  description: string | null
  status: string
  statusType: string | null
  priority: number | null
  assigneeName: string | null
  linearUpdatedAt: Date | null
  updatedAt: Date
}

type IssueContextSummary = {
  mode: IssueContextMode
  totalCached: number
  totalInScope: number
  injectedCount: number
  lines: string[]
}

function extractLatestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') continue

    const parts = Array.isArray(message.parts) ? message.parts : []
    const textFromParts = parts
      .map((part) => {
        if (
          typeof part === 'object' &&
          part !== null &&
          'type' in part &&
          (part as { type?: string }).type === 'text' &&
          'text' in part &&
          typeof (part as { text?: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text
        }
        return ''
      })
      .filter(Boolean)

    if (textFromParts.length > 0) {
      return textFromParts.join(' ').trim()
    }

    if ('content' in message && typeof message.content === 'string') {
      return message.content
    }
  }

  return ''
}

function detectIssueContextMode(userText: string): IssueContextMode {
  if (!userText) return 'activeOnly'

  const ideationPattern =
    /\b(new idea|new ideas|brainstorm|ideate|ideation|strategy|roadmap|opportunit(?:y|ies)|what should we build|next feature|innovation|innovate|improve|improvement)\b/i

  return ideationPattern.test(userText) ? 'includeCompleted' : 'activeOnly'
}

function inferWorkItemsStatusFilter(userText: string): WorkItemsStatusFilter | null {
  if (!userText) return null

  if (/\b(in progress|in-progress|ongoing|currently working|wip)\b/i.test(userText)) {
    return 'inProgress'
  }

  if (/\b(todo|to-do|unstarted|not started|pending)\b/i.test(userText)) {
    return 'todo'
  }

  if (/\b(urgent|critical|high priority|p0|p1)\b/i.test(userText)) {
    return 'urgent'
  }

  if (/\b(all issues|everything|all tasks|all work items)\b/i.test(userText)) {
    return 'all'
  }

  return null
}

function extractSearchTokens(userText: string): string[] {
  const rawTokens = userText.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? []
  const filtered = rawTokens.filter((token) => !LINEAR_CONTEXT_STOP_WORDS.has(token))
  return Array.from(new Set(filtered)).slice(0, 10)
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function issueRecencyTimestamp(issue: LinearIssueContextRow): number {
  return (issue.linearUpdatedAt ?? issue.updatedAt).getTime()
}

function buildLinearIssuesContext(rows: LinearIssueContextRow[], latestUserText: string): IssueContextSummary {
  const mode = detectIssueContextMode(latestUserText)

  const inScope = rows.filter((issue) => {
    if (mode === 'includeCompleted') return true

    const bucket = getIssueBucket(issue.statusType, issue.status)
    return bucket === 'todo' || bucket === 'inProgress'
  })

  const searchTokens = extractSearchTokens(latestUserText)
  const ranked = inScope
    .map((issue) => {
      const haystack = normalizeWhitespace(
        `${issue.identifier} ${issue.title} ${issue.description ?? ''} ${issue.assigneeName ?? ''} ${issue.status}`,
      ).toLowerCase()

      let score = 0
      for (const token of searchTokens) {
        if (haystack.includes(token)) score++
      }

      return { issue, score }
    })
    .sort(
      (left, right) =>
        right.score - left.score || issueRecencyTimestamp(right.issue) - issueRecencyTimestamp(left.issue),
    )

  const maxItems = mode === 'includeCompleted' ? MAX_LINEAR_ISSUES_CONTEXT_IDEATION : MAX_LINEAR_ISSUES_CONTEXT_ACTIVE
  const selectedIssues = ranked.slice(0, maxItems).map((entry) => entry.issue)

  const lines = selectedIssues.map((issue) => {
    const bucket = getIssueBucket(issue.statusType, issue.status)
    const bucketLabel = bucket === 'inProgress' ? 'in-progress' : bucket
    const priorityLabel = issue.priority != null ? (PRIORITY_LABEL[issue.priority] ?? 'none') : 'none'
    const description = issue.description ? truncateText(normalizeWhitespace(issue.description), 240) : ''

    return [
      `- ${issue.identifier}`,
      `bucket: ${bucketLabel}`,
      `title: ${truncateText(normalizeWhitespace(issue.title), 140)}`,
      issue.assigneeName ? `owner: ${issue.assigneeName}` : null,
      `priority: ${priorityLabel}`,
      description ? `description: ${description}` : null,
    ]
      .filter(Boolean)
      .join(' | ')
  })

  return {
    mode,
    totalCached: rows.length,
    totalInScope: inScope.length,
    injectedCount: selectedIssues.length,
    lines,
  }
}

function buildSystemPrompt(
  workspaceName: string | null,
  memberRows: (typeof members.$inferSelect)[],
  issueContext: IssueContextSummary,
): string {
  const parts: string[] = []
  const workspace = workspaceName ? ` for the **${workspaceName}** workspace` : ''
  parts.push(
    `You are Beacon AI, an intelligent PM assistant${workspace}. Help the team stay on top of projects, priorities, and capacity.\n\nYou have access to tools to display projects, team info, and work items visually — use them proactively when the user asks to see or show something.\n\nBe concise and direct.`,
  )

  parts.push('\n## Response Rendering Rules')
  parts.push('- For issue snapshots, priority breakdowns, or current task lists, always call display_work_items first.')
  parts.push(
    '- Do not output markdown tables for issue lists when display_work_items can render a visual artifact view.',
  )
  parts.push('- Keep narrative short when a tool-rendered view is shown.')

  parts.push('\n## Linear Issue Context Policy')
  parts.push('- Current-issues mode: use only todo and in-progress issues.')
  parts.push('- Ideation mode: include completed issues only to avoid duplicate suggestions and repeated work.')
  parts.push('- Never recommend redoing issues that are already completed unless explicitly asked to reopen/regress.')

  parts.push('\n## Linear Issue Context Snapshot')
  parts.push(
    `- Scope mode: ${issueContext.mode === 'activeOnly' ? 'current issues (todo + in-progress only)' : 'ideation (all statuses, including completed)'}; cached: ${issueContext.totalCached}; in-scope: ${issueContext.totalInScope}; injected: ${issueContext.injectedCount}.`,
  )

  if (issueContext.lines.length > 0) {
    parts.push(...issueContext.lines)
  } else {
    parts.push('- No synced Linear issue context is available yet.')
  }

  if (memberRows.length > 0) {
    parts.push('\n## Team')
    for (const m of memberRows) {
      const role = m.role ? ` (${m.role})` : ''
      parts.push(`- ${m.name}${role}`)
    }
  }

  return parts.join('\n')
}

export async function POST(req: Request) {
  const session = await getServerSession()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const userId = session.user.id
  const { messages }: { messages: UIMessage[] } = await req.json()
  const latestUserText = extractLatestUserText(messages)

  const [connectionRows, memberRows, linearIssueRows] = await Promise.all([
    db.select().from(linearConnections).where(eq(linearConnections.userId, userId)).limit(1),
    db.select().from(members).where(eq(members.userId, userId)).orderBy(members.name),
    db
      .select({
        identifier: linearIssues.identifier,
        title: linearIssues.title,
        description: linearIssues.description,
        status: linearIssues.status,
        statusType: linearIssues.statusType,
        priority: linearIssues.priority,
        assigneeName: linearIssues.assigneeName,
        linearUpdatedAt: linearIssues.linearUpdatedAt,
        updatedAt: linearIssues.updatedAt,
      })
      .from(linearIssues)
      .where(eq(linearIssues.userId, userId))
      .orderBy(desc(linearIssues.linearUpdatedAt), desc(linearIssues.updatedAt))
      .limit(600),
  ])

  const workspaceName = connectionRows[0]?.workspaceName ?? connectionRows[0]?.workspaceSlug ?? null
  const issueContext = buildLinearIssuesContext(linearIssueRows, latestUserText)
  const systemPrompt = buildSystemPrompt(workspaceName, memberRows, issueContext)

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: systemPrompt,
    messages: convertToModelMessages(messages),
    tools: {
      display_projects: tool({
        description:
          'Display all projects as visual cards showing name, description, and issue counts. Use this when the user asks to see, show, or list their projects.',
        inputSchema: zodSchema(z.object({})),
        execute: async () => {
          const rows = await db
            .select({
              id: projects.id,
              name: projects.name,
              description: projects.description,
              issueCount: sql<number>`(select count(*) from work_items where work_items.project_id = ${projects.id} and (work_items.status_type is null or work_items.status_type not in ('completed','cancelled')))::int`,
            })
            .from(projects)
            .where(eq(projects.userId, userId))
            .orderBy(projects.updatedAt)
          return { projects: rows }
        },
      }),

      display_team: tool({
        description:
          'Display the team roster as cards showing name, role, skills, and workload. Use this when the user asks about the team, capacity, or who is working on what.',
        inputSchema: zodSchema(z.object({})),
        execute: async () => {
          const rows = await db.select().from(members).where(eq(members.userId, userId)).orderBy(members.name)
          return {
            members: rows.map((m) => ({
              id: m.id,
              name: m.name,
              role: m.role,
              currentWorkload: m.currentWorkload,
              inferredSkills: m.inferredSkills,
              avatarUrl: m.avatarUrl,
            })),
          }
        },
      }),

      display_work_items: tool({
        description:
          'Display work items as visual issue artifact cards with status, priority, assignee, and issue details. Optionally filter by project name. Use this when the user asks to see tasks, issues, or work items.',
        inputSchema: zodSchema(
          z.object({
            projectName: z.string().optional().describe('Filter by project name (partial match)'),
            statusFilter: z
              .enum(['all', 'active', 'urgent', 'inProgress', 'todo'])
              .default('active')
              .describe(
                'active = todo + in-progress + backlog, inProgress = only started work, todo = unstarted/todo, urgent = priority 1 or 2',
              ),
          }),
        ),
        execute: async (input: { projectName?: string; statusFilter: WorkItemsStatusFilter }) => {
          const { projectName } = input

          const inferredStatusFilter = inferWorkItemsStatusFilter(latestUserText)
          const effectiveStatusFilter: WorkItemsStatusFilter =
            input.statusFilter === 'active' && inferredStatusFilter ? inferredStatusFilter : input.statusFilter

          const projectNameFilter = projectName?.trim().toLowerCase() ?? null

          const whereClause = projectNameFilter
            ? and(
                eq(linearIssues.userId, userId),
                sql`lower(coalesce(${linearIssues.projectName}, '')) like ${`%${projectNameFilter}%`}`,
              )
            : eq(linearIssues.userId, userId)

          const rows = await db
            .select({
              id: linearIssues.id,
              identifier: linearIssues.identifier,
              title: linearIssues.title,
              description: linearIssues.description,
              status: linearIssues.status,
              statusType: linearIssues.statusType,
              priority: linearIssues.priority,
              assigneeName: linearIssues.assigneeName,
              dueDate: linearIssues.dueDate,
              linearUrl: linearIssues.linearUrl,
              projectName: linearIssues.projectName,
              linearUpdatedAt: linearIssues.linearUpdatedAt,
              updatedAt: linearIssues.updatedAt,
            })
            .from(linearIssues)
            .where(whereClause)
            .orderBy(desc(linearIssues.linearUpdatedAt), desc(linearIssues.updatedAt))
            .limit(800)

          const filteredRows = rows.filter((row) => {
            const bucket = getIssueBucket(row.statusType, row.status)

            if (effectiveStatusFilter === 'all') {
              return true
            }

            if (effectiveStatusFilter === 'inProgress') {
              return bucket === 'inProgress'
            }

            if (effectiveStatusFilter === 'todo') {
              return bucket === 'todo'
            }

            if (effectiveStatusFilter === 'urgent') {
              const isUrgentPriority = row.priority === 1 || row.priority === 2
              return isUrgentPriority && (bucket === 'todo' || bucket === 'inProgress' || bucket === 'backlog')
            }

            return bucket === 'todo' || bucket === 'inProgress' || bucket === 'backlog'
          })

          const topRows = filteredRows.slice(0, 50)

          return {
            items: topRows.map((item) => ({
              id: item.id,
              identifier: item.identifier,
              title: item.title,
              description: item.description,
              status: item.status,
              statusType: item.statusType,
              priority: item.priority,
              priorityLabel: item.priority != null ? (PRIORITY_LABEL[item.priority] ?? 'unknown') : 'none',
              assigneeName: item.assigneeName,
              dueDate: item.dueDate?.toISOString() ?? null,
              linearUrl: item.linearUrl,
              projectName: item.projectName ?? '',
            })),
          }
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}
