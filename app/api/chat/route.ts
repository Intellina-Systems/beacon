import { streamText, tool, zodSchema, convertToModelMessages } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import {
  githubCommits,
  githubLinearLinks,
  githubPullRequests,
  members,
  products,
  productLinearConnections,
  linearConnections,
  linearIssues,
} from '@/lib/db/schema'
import { eq, sql, desc, and } from 'drizzle-orm'
import type { UIMessage } from 'ai'
import { getIssueBucket } from '@/lib/linear/issue-bucket'
import { retrieveKnowledgeContext } from '@/lib/knowledge/retrieve'

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

type ProductContext = {
  id: string
  name: string
  description: string | null
}

type GitHubContextRow = {
  type: 'pull_request' | 'commit' | 'link'
  label: string
  detail: string
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
  product: ProductContext | null,
  workspaceName: string | null,
  memberRows: (typeof members.$inferSelect)[],
  issueContext: IssueContextSummary,
  githubContext: GitHubContextRow[],
  knowledgeContext: Awaited<ReturnType<typeof retrieveKnowledgeContext>>,
): string {
  const parts: string[] = []
  const workspace = workspaceName ? ` for the **${workspaceName}** workspace` : ''
  if (!product) {
    parts.push(
      'You are Beacon AI, an intelligent PM assistant. The user has not selected a product. Ask them to create or select a product before giving project, Linear, GitHub, or team analysis.',
    )
    return parts.join('\n')
  }

  parts.push(
    `You are Beacon AI, an intelligent PM assistant${workspace}. The selected product is **${product.name}**. Keep every answer scoped to this product unless the user explicitly asks for all products.\n\nYou have access to tools to display products, team info, and product-scoped work items visually — use them proactively when the user asks to see or show something.\n\nBe concise and direct.`,
  )

  if (product.description) {
    parts.push(`\n## Product\n${product.description}`)
  }

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

  parts.push('\n## GitHub Context Snapshot')
  if (githubContext.length > 0) {
    for (const row of githubContext) {
      parts.push(`- ${row.type}: ${row.label} | ${row.detail}`)
    }
  } else {
    parts.push('- No product-scoped GitHub pull requests, commits, or links are available yet.')
  }

  parts.push('\n## Retrieved Knowledge Sources')
  if (knowledgeContext.documents.length > 0) {
    for (const document of knowledgeContext.documents) {
      const summary = document.summary ?? truncateText(normalizeWhitespace(document.content), 260)
      parts.push(
        `- ${document.title} | source: ${document.sourceType} | similarity: ${document.similarity.toFixed(2)} | ${truncateText(normalizeWhitespace(summary), 260)}`,
      )
    }
  } else {
    parts.push('- No semantically relevant knowledge sources are available yet.')
  }

  parts.push('\n## Knowledge Signal Snapshot')
  if (knowledgeContext.signals.length > 0) {
    for (const signal of knowledgeContext.signals) {
      const evidence = signal.evidence ? ` | evidence: ${truncateText(normalizeWhitespace(signal.evidence), 140)}` : ''
      parts.push(
        `- ${signal.kind} | confidence: ${signal.confidence}/5 | ${signal.title}: ${truncateText(normalizeWhitespace(signal.detail), 220)}${evidence}`,
      )
    }
  } else {
    parts.push('- No product-scoped knowledge signals are available yet.')
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
  const productId = new URL(req.url).searchParams.get('productId')
  const { messages }: { messages: UIMessage[] } = await req.json()
  const latestUserText = extractLatestUserText(messages)

  const [connectionRows, memberRows, productRows, productLinearRows] = await Promise.all([
    db.select().from(linearConnections).where(eq(linearConnections.userId, userId)).limit(1),
    db.select().from(members).where(eq(members.userId, userId)).orderBy(members.name),
    productId
      ? db
          .select({
            id: products.id,
            name: products.name,
            description: products.description,
          })
          .from(products)
          .where(and(eq(products.id, productId), eq(products.userId, userId)))
          .limit(1)
      : Promise.resolve([]),
    productId
      ? db.select().from(productLinearConnections).where(eq(productLinearConnections.productId, productId))
      : Promise.resolve([]),
  ])

  const selectedProduct = productRows[0] ?? null
  const linearConnection = connectionRows[0] ?? null
  const hasLinearWorkspace = linearConnection
    ? productLinearRows.some((connection) => connection.linearWorkspaceId === linearConnection.workspaceId)
    : false

  const [linearIssueRows, githubRows, knowledgeContext] = await Promise.all([
    selectedProduct && hasLinearWorkspace
      ? db
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
          .limit(600)
      : Promise.resolve([]),
    selectedProduct
      ? Promise.all([
          db
            .select({
              title: githubPullRequests.title,
              number: githubPullRequests.number,
              state: githubPullRequests.state,
              authorLogin: githubPullRequests.authorLogin,
              githubUpdatedAt: githubPullRequests.githubUpdatedAt,
            })
            .from(githubPullRequests)
            .where(eq(githubPullRequests.productId, selectedProduct.id))
            .orderBy(desc(githubPullRequests.githubUpdatedAt), desc(githubPullRequests.updatedAt))
            .limit(15),
          db
            .select({
              message: githubCommits.message,
              authorLogin: githubCommits.authorLogin,
              authorName: githubCommits.authorName,
              committedAt: githubCommits.committedAt,
            })
            .from(githubCommits)
            .where(eq(githubCommits.productId, selectedProduct.id))
            .orderBy(desc(githubCommits.committedAt), desc(githubCommits.updatedAt))
            .limit(15),
          db
            .select({
              status: githubLinearLinks.status,
              source: githubLinearLinks.source,
              issueIdentifier: linearIssues.identifier,
              prTitle: githubPullRequests.title,
              commitMessage: githubCommits.message,
            })
            .from(githubLinearLinks)
            .innerJoin(linearIssues, eq(linearIssues.id, githubLinearLinks.linearIssueId))
            .leftJoin(githubPullRequests, eq(githubPullRequests.id, githubLinearLinks.githubPullRequestId))
            .leftJoin(githubCommits, eq(githubCommits.id, githubLinearLinks.githubCommitId))
            .where(eq(githubLinearLinks.productId, selectedProduct.id))
            .limit(20),
        ])
      : Promise.resolve([[], [], []] as const),
    selectedProduct
      ? retrieveKnowledgeContext({
          productId: selectedProduct.id,
          query: latestUserText,
        })
      : Promise.resolve({ documents: [], signals: [] }),
  ])

  const workspaceName = linearConnection?.workspaceName ?? linearConnection?.workspaceSlug ?? null
  const issueContext = buildLinearIssuesContext(linearIssueRows, latestUserText)
  const [pullRequestRows, commitRows, linkRows] = githubRows
  const githubContext: GitHubContextRow[] = [
    ...pullRequestRows.map((pullRequest) => ({
      type: 'pull_request' as const,
      label: `#${pullRequest.number} ${pullRequest.title}`,
      detail: `state: ${pullRequest.state}; author: ${pullRequest.authorLogin ?? 'unknown'}`,
    })),
    ...commitRows.map((commit) => ({
      type: 'commit' as const,
      label: truncateText(normalizeWhitespace(commit.message.split('\n')[0] ?? commit.message), 140),
      detail: `author: ${commit.authorLogin ?? commit.authorName ?? 'unknown'}`,
    })),
    ...linkRows.map((link) => ({
      type: 'link' as const,
      label: `${link.issueIdentifier} -> ${link.prTitle ?? truncateText(normalizeWhitespace(link.commitMessage ?? ''), 100)}`,
      detail: `source: ${link.source}; status: ${link.status}`,
    })),
  ].slice(0, 35)
  const systemPrompt = buildSystemPrompt(
    selectedProduct,
    workspaceName,
    memberRows,
    issueContext,
    githubContext,
    knowledgeContext,
  )

  const result = streamText({
    model: openai('gpt-5.4-nano'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: {
      display_projects: tool({
        description:
          'Display all products as visual cards showing name, description, and active issue counts. Use this when the user asks to see, show, or list their products.',
        inputSchema: zodSchema(z.object({})),
        execute: async () => {
          const rows = await db
            .select({
              id: products.id,
              name: products.name,
              description: products.description,
              issueCount: sql<number>`(
                select count(*)
                from linear_issues
                where linear_issues.user_id = ${userId}
                  and exists (
                    select 1
                    from product_linear_connections
                    inner join linear_connections
                      on linear_connections.user_id = ${userId}
                     and linear_connections.workspace_id = product_linear_connections.linear_workspace_id
                    where product_linear_connections.product_id = "products"."id"
                  )
                  and (linear_issues.status_type is null or linear_issues.status_type not in ('completed','cancelled'))
              )::int`,
            })
            .from(products)
            .where(eq(products.userId, userId))
            .orderBy(products.updatedAt)
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

          if (!selectedProduct || !hasLinearWorkspace) {
            return { items: [] }
          }

          const productLinearRow = productLinearRows[0] ?? null

          // Scope to the product's connected Linear project or team, falling back to userId only
          const linearProjectScope = productLinearRow?.linearProjectId
            ? eq(linearIssues.linearProjectId, productLinearRow.linearProjectId)
            : productLinearRow?.linearTeamId
              ? eq(linearIssues.linearTeamId, productLinearRow.linearTeamId)
              : undefined

          // Only apply text-based project name filter when it differs from the selected product name,
          // because the LLM often passes the Beacon product name which won't match Linear's projectName field
          const isProductNamePassthrough =
            !projectNameFilter || projectNameFilter === selectedProduct.name.toLowerCase().trim()
          const textProjectFilter = !isProductNamePassthrough
            ? sql`lower(coalesce(${linearIssues.projectName}, '')) like ${`%${projectNameFilter}%`}`
            : undefined

          const whereClause = and(eq(linearIssues.userId, userId), linearProjectScope, textProjectFilter)

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

  return result.toUIMessageStreamResponse({ originalMessages: messages })
}
