import { streamText, tool, zodSchema, convertToModelMessages, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { UIMessage } from 'ai'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { members, workItems, EVENT_SOURCES, WORK_ITEM_STATUSES, type Event } from '@/lib/db/schema'
import { getActiveBlockers, getMemberActivity, getPulse, listEvents } from '@/lib/events/queries'
import { retrieveKnowledgeContext } from '@/lib/knowledge/retrieve'

const PRIORITY_LABEL: Record<number, string> = { 0: 'none', 1: 'urgent', 2: 'high', 3: 'medium', 4: 'low' }

function extractLatestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') continue
    const parts = Array.isArray(message.parts) ? message.parts : []
    const text = parts
      .map((part) =>
        typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part
          ? String((part as { text: unknown }).text)
          : '',
      )
      .filter(Boolean)
      .join(' ')
      .trim()
    if (text) return text
  }
  return ''
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`
}

export async function POST(req: Request) {
  const session = await getServerSession()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })

  const userId = session.user.id
  const { messages }: { messages: UIMessage[] } = await req.json()
  const latestUserText = extractLatestUserText(messages)

  const [pulse, blockers, roster, memberActivity, activeItems, recentEvents, knowledge] = await Promise.all([
    getPulse(userId, 7),
    getActiveBlockers(userId),
    db.select().from(members).where(eq(members.userId, userId)).orderBy(members.name),
    getMemberActivity(userId, 7),
    db
      .select({
        key: workItems.key,
        title: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        assigneeMemberId: workItems.assigneeMemberId,
      })
      .from(workItems)
      .where(and(eq(workItems.userId, userId), inArray(workItems.status, ['in_progress', 'in_review', 'blocked'])))
      .orderBy(desc(workItems.updatedAt))
      .limit(40),
    listEvents(userId, { limit: 25 }),
    retrieveKnowledgeContext({ userId, query: latestUserText }),
  ])

  const memberById = new Map(roster.map((member) => [member.id, member]))

  const systemParts: string[] = [
    'You are Beacon, the engineering intelligence layer for this team. You sit above GitHub, Linear, coding agents, CI/CD, and communication tools, continuously understanding what is happening. Everything you know is derived from an append-only event stream — never guess beyond it.',
    'Be concise and direct. Use tools proactively when the user asks to see or list something: display_work_items for work item views, display_team for the roster, get_blockers for who is stuck, query_events for anything time- or activity-related, search_knowledge for docs/notes context. Prefer a tool call over a hand-written table.',
    '',
    `## Pulse — last ${pulse.sinceDays} days`,
    `- ${pulse.totalEvents} events total | work ${pulse.byCategory.work}, code ${pulse.byCategory.code}, ci/cd ${pulse.byCategory.cicd}, agents ${pulse.byCategory.agent}, comms ${pulse.byCategory.comms}, knowledge ${pulse.byCategory.knowledge}`,
    `- ${pulse.prsMerged} PRs merged, ${pulse.ciFailures} CI failures, ${pulse.activeMemberIds.length} active engineers`,
    '',
    '## Active blockers',
    ...(blockers.length > 0
      ? blockers
          .slice(0, 10)
          .map(
            (blocker) =>
              `- ${truncate(blocker.event.summary, 200)}${blocker.member ? ` (${blocker.member.name})` : ''}`,
          )
      : ['- none detected']),
    '',
    '## Work in flight',
    ...(activeItems.length > 0
      ? activeItems.map((item) => {
          const assignee = item.assigneeMemberId ? memberById.get(item.assigneeMemberId)?.name : null
          return `- ${item.key ?? ''} ${truncate(item.title, 120)} | ${item.status}${item.priority ? ` | ${PRIORITY_LABEL[item.priority]}` : ''}${assignee ? ` | ${assignee}` : ''}`
        })
      : ['- nothing in flight']),
    '',
    '## Latest events',
    ...(recentEvents.length > 0
      ? recentEvents.map(
          (event) =>
            `- [${event.source}] ${event.type}: ${truncate(event.summary, 160)} (${event.occurredAt.toISOString()})`,
        )
      : ['- no events yet — suggest connecting sources in /integrations or pushing events to /api/events']),
    '',
    '## Team',
    ...(roster.length > 0
      ? roster.map((member) => {
          const activity = memberActivity.get(member.id)
          return `- ${member.name}${member.role ? ` (${member.role})` : ''} — ${activity ? `${activity.total} events this week` : 'quiet this week'}`
        })
      : ['- no members on the roster yet']),
  ]

  if (knowledge.documents.length > 0 || knowledge.signals.length > 0) {
    systemParts.push('', '## Relevant knowledge')
    for (const document of knowledge.documents) {
      systemParts.push(`- doc: ${document.title} | ${truncate(document.summary ?? document.content, 200)}`)
    }
    for (const signal of knowledge.signals.slice(0, 10)) {
      systemParts.push(
        `- signal (${signal.kind}, ${signal.confidence}/5): ${signal.title} — ${truncate(signal.detail, 160)}`,
      )
    }
  }

  const result = streamText({
    model: openai('gpt-5.4-nano'),
    system: systemParts.join('\n'),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      query_events: tool({
        description:
          'Query the raw event stream with filters — time range, source (github, linear, agent, cicd…), event types, or a member name. Use for questions like "what happened yesterday", "what did X do this week", "any deploys?", "what merged?". Returns raw events for you to summarize in prose.',
        inputSchema: zodSchema(
          z.object({
            sinceDays: z.number().int().min(1).max(90).default(7),
            source: z.enum(EVENT_SOURCES).optional(),
            types: z
              .array(z.string())
              .optional()
              .describe('Dot-namespaced event types, e.g. ["pr.merged", "ci.failed"]'),
            memberName: z.string().optional().describe('Filter to one engineer by name'),
            limit: z.number().int().min(1).max(200).default(50),
          }),
        ),
        execute: async (input: {
          sinceDays: number
          source?: Event['source']
          types?: string[]
          memberName?: string
          limit: number
        }) => {
          const memberId = input.memberName
            ? roster.find((member) => member.name.toLowerCase().includes(input.memberName!.toLowerCase()))?.id
            : undefined
          const rows = await listEvents(userId, {
            sinceDays: input.sinceDays,
            source: input.source,
            types: input.types,
            memberId,
            limit: input.limit,
          })
          return {
            events: rows.map((row) => ({
              source: row.source,
              type: row.type,
              summary: row.summary,
              actor: row.memberName ?? row.actorLabel,
              workItem: row.workItemKey,
              occurredAt: row.occurredAt.toISOString(),
            })),
          }
        },
      }),

      display_work_items: tool({
        description:
          'Display work items as visual cards with status, priority, and assignee. Use when the user asks to see tasks, work, the backlog, or what is in progress.',
        inputSchema: zodSchema(
          z.object({
            statuses: z
              .array(z.enum(WORK_ITEM_STATUSES))
              .optional()
              .describe('Statuses to include. Defaults to active work (todo, in_progress, in_review, blocked).'),
            assigneeName: z.string().optional().describe('Filter to one engineer by name'),
          }),
        ),
        execute: async (input: { statuses?: string[]; assigneeName?: string }) => {
          const statuses = input.statuses?.length ? input.statuses : ['todo', 'in_progress', 'in_review', 'blocked']
          const assignee = input.assigneeName
            ? roster.find((member) => member.name.toLowerCase().includes(input.assigneeName!.toLowerCase()))
            : undefined

          const rows = await db
            .select({
              id: workItems.id,
              key: workItems.key,
              title: workItems.title,
              description: workItems.description,
              status: workItems.status,
              priority: workItems.priority,
              assigneeMemberId: workItems.assigneeMemberId,
              dueDate: workItems.dueDate,
              externalUrl: workItems.externalUrl,
            })
            .from(workItems)
            .where(
              and(
                eq(workItems.userId, userId),
                inArray(workItems.status, statuses as never),
                assignee ? eq(workItems.assigneeMemberId, assignee.id) : undefined,
              ),
            )
            .orderBy(desc(workItems.updatedAt))
            .limit(50)

          return {
            items: rows.map((item) => ({
              id: item.id,
              identifier: item.key ?? '',
              title: item.title,
              description: item.description,
              status: item.status,
              priority: item.priority,
              priorityLabel: item.priority != null ? (PRIORITY_LABEL[item.priority] ?? 'none') : 'none',
              assigneeName: item.assigneeMemberId ? (memberById.get(item.assigneeMemberId)?.name ?? null) : null,
              dueDate: item.dueDate?.toISOString() ?? null,
              url: item.externalUrl,
            })),
          }
        },
      }),

      display_team: tool({
        description:
          'Display the team roster as cards with role and weekly activity. Use when the user asks about the team, who is active, or capacity.',
        inputSchema: zodSchema(z.object({})),
        execute: async () => ({
          members: roster.map((member) => ({
            id: member.id,
            name: member.name,
            role: member.role,
            avatarUrl: member.avatarUrl,
            weeklyEvents: memberActivity.get(member.id)?.total ?? 0,
            skills: member.skills,
          })),
        }),
      }),

      get_blockers: tool({
        description:
          'Return the currently active blockers — blocking events (task.blocked, agent.blocked, ci.failed…) with no later unblocking signal, plus work items sitting in blocked status. Use whenever the user asks who or what is blocked or stuck.',
        inputSchema: zodSchema(z.object({})),
        execute: async () => ({
          blockers: blockers.map((blocker) => ({
            summary: blocker.event.summary,
            type: blocker.event.type,
            source: blocker.event.source,
            member: blocker.member?.name ?? null,
            workItem: blocker.workItem ? `${blocker.workItem.key ?? ''} ${blocker.workItem.title}`.trim() : null,
            since: blocker.event.occurredAt.toISOString(),
          })),
        }),
      }),

      search_knowledge: tool({
        description:
          'Semantic search over the ingested knowledge base (meeting notes, docs, emails, links) and its extracted signals. Use for questions about decisions, requirements, user needs, or anything discussed outside the code/work trackers.',
        inputSchema: zodSchema(z.object({ query: z.string().min(1).max(500) })),
        execute: async (input: { query: string }) => {
          const context = await retrieveKnowledgeContext({ userId, query: input.query, maxDocuments: 6 })
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
      }),
    },
  })

  return result.toUIMessageStreamResponse({ originalMessages: messages })
}
