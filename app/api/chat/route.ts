import { streamText, tool, zodSchema, convertToModelMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { projects, workItems, members, linearConnections } from '@/lib/db/schema'
import { eq, and, or, isNull, notInArray, inArray, sql } from 'drizzle-orm'
import type { UIMessage } from 'ai'

const PRIORITY_LABEL: Record<number, string> = { 0: 'none', 1: 'urgent', 2: 'high', 3: 'medium', 4: 'low' }

function buildSystemPrompt(
  workspaceName: string | null,
  projectRows: typeof projects.$inferSelect[],
  memberRows: typeof members.$inferSelect[],
): string {
  const parts: string[] = []
  const workspace = workspaceName ? ` for the **${workspaceName}** workspace` : ''
  parts.push(
    `You are Beacon AI, an intelligent PM assistant${workspace}. Help the team stay on top of projects, priorities, and capacity.\n\nYou have access to tools to display projects, team info, and work items visually — use them proactively when the user asks to see or show something.\n\nBe concise and direct.`,
  )

  if (memberRows.length > 0) {
    parts.push('\n## Team')
    for (const m of memberRows) {
      const role = m.role ? ` (${m.role})` : ''
      parts.push(`- ${m.name}${role}`)
    }
  }

  if (projectRows.length > 0) {
    parts.push('\n## Projects')
    for (const p of projectRows) {
      parts.push(`- ${p.name}${p.description ? `: ${p.description}` : ''}`)
    }
  }

  return parts.join('\n')
}

export async function POST(req: Request) {
  const session = await getServerSession()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const userId = session.user.id
  const { messages }: { messages: UIMessage[] } = await req.json()

  const [connectionRows, projectRows, memberRows] = await Promise.all([
    db.select().from(linearConnections).where(eq(linearConnections.userId, userId)).limit(1),
    db.select().from(projects).where(eq(projects.userId, userId)).orderBy(projects.updatedAt),
    db.select().from(members).where(eq(members.userId, userId)).orderBy(members.name),
  ])

  const workspaceName = connectionRows[0]?.workspaceName ?? connectionRows[0]?.workspaceSlug ?? null
  const systemPrompt = buildSystemPrompt(workspaceName, projectRows, memberRows)
  const projectIds = projectRows.map((p) => p.id)

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
              issueCount:
                sql<number>`(select count(*) from work_items where work_items.project_id = ${projects.id} and (work_items.status_type is null or work_items.status_type not in ('completed','cancelled')))::int`,
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
          const rows = await db
            .select()
            .from(members)
            .where(eq(members.userId, userId))
            .orderBy(members.name)
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
          'Display work items as a visual list with status, priority, and assignee. Optionally filter by project name. Use this when the user asks to see tasks, issues, or work items.',
        inputSchema: zodSchema(
          z.object({
            projectName: z.string().optional().describe('Filter by project name (partial match)'),
            statusFilter: z
              .enum(['all', 'active', 'urgent'])
              .default('active')
              .describe('active = exclude completed/cancelled, urgent = priority 1 or 2 only'),
          }),
        ),
        execute: async (input: { projectName?: string; statusFilter: 'all' | 'active' | 'urgent' }) => {
          const { projectName, statusFilter } = input
          if (projectIds.length === 0) return { items: [] }

          let filteredIds = projectIds
          if (projectName) {
            filteredIds = projectRows
              .filter((p) => p.name.toLowerCase().includes(projectName.toLowerCase()))
              .map((p) => p.id)
            if (filteredIds.length === 0) return { items: [] }
          }

          const baseFilter = and(
            inArray(workItems.projectId, filteredIds),
            statusFilter !== 'all'
              ? or(isNull(workItems.statusType), notInArray(workItems.statusType, ['completed', 'cancelled']))
              : undefined,
          )

          const rows = await db
            .select()
            .from(workItems)
            .where(
              statusFilter === 'urgent'
                ? and(baseFilter, sql`${workItems.priority} in (1, 2)`)
                : baseFilter,
            )
            .orderBy(workItems.priority, workItems.updatedAt)
            .limit(50)

          return {
            items: rows.map((item) => ({
              id: item.id,
              title: item.title,
              status: item.status,
              statusType: item.statusType,
              priority: item.priority,
              priorityLabel: item.priority != null ? (PRIORITY_LABEL[item.priority] ?? 'unknown') : 'none',
              assigneeName: item.assigneeName,
              dueDate: item.dueDate?.toISOString() ?? null,
              linearUrl: item.linearUrl,
              projectName: projectRows.find((p) => p.id === item.projectId)?.name ?? '',
            })),
          }
        },
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}
