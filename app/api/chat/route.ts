import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import type { UIMessage } from 'ai'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { visibleMemberIds } from '@/lib/auth/permissions'
import { db } from '@/lib/db/client'
import { members, workItems } from '@/lib/db/schema'
import { getActiveBlockers, getLiveActivity, getMemberActivity, getPulse, listEvents } from '@/lib/events/queries'
import { retrieveKnowledgeContext } from '@/lib/knowledge/retrieve'
import { DEFAULT_RESPONSE_LEVEL, RESPONSE_LEVEL_INSTRUCTIONS, isResponseLevel } from '@/lib/chat/response-level'
import { buildChatTools } from '@/lib/chat/tools'
import type { ChatToolContext } from '@/lib/chat/tools/shared'
import { persistTurn } from '@/lib/chat/persistence'

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
  const ctx = await getWorkspaceContext()
  if (!ctx) return new Response('Unauthorized', { status: 401 })

  const workspaceId = ctx.workspaceId
  const visible = await visibleMemberIds(ctx)
  const body: {
    messages: UIMessage[]
    conversationId?: unknown
    responseLevel?: unknown
    scope?: { engineId?: string | null; teamId?: string | null }
  } = await req.json()
  const { messages } = body
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : undefined
  const responseLevel = isResponseLevel(body.responseLevel) ? body.responseLevel : DEFAULT_RESPONSE_LEVEL
  const latestUserText = extractLatestUserText(messages)
  // Optional org scope: when chat is opened from a team or engine page, answer
  // from that unit's documents only.
  const scope =
    body.scope?.engineId || body.scope?.teamId
      ? { engineId: body.scope.engineId ?? null, teamId: body.scope.teamId ?? null }
      : undefined

  const [pulse, blockers, roster, memberActivity, activeItems, recentEvents, knowledge, liveActivity] =
    await Promise.all([
      getPulse(workspaceId, 7),
      getActiveBlockers(workspaceId, 14, visible),
      db.select().from(members).where(eq(members.workspaceId, workspaceId)).orderBy(members.name),
      getMemberActivity(workspaceId, 7, visible),
      db
        .select({
          key: workItems.key,
          title: workItems.title,
          status: workItems.status,
          priority: workItems.priority,
          assigneeMemberId: workItems.assigneeMemberId,
        })
        .from(workItems)
        .where(
          and(
            eq(workItems.workspaceId, workspaceId),
            inArray(workItems.status, ['in_progress', 'in_review', 'blocked']),
            visible
              ? or(
                  inArray(workItems.assigneeMemberId, visible.length ? visible : ['__none__']),
                  isNull(workItems.assigneeMemberId),
                )
              : undefined,
          ),
        )
        .orderBy(desc(workItems.updatedAt))
        .limit(40),
      listEvents(workspaceId, { limit: 25, visibleMemberIds: visible }),
      retrieveKnowledgeContext({ workspaceId, query: latestUserText, scope }),
      getLiveActivity(workspaceId, 12, visible),
    ])

  const memberById = new Map(roster.map((member) => [member.id, member]))

  const now = new Date()
  const minutesAgo = (at: Date) => Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000))
  const agoLabel = (at: Date) => {
    const mins = minutesAgo(at)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
  }

  const systemParts: string[] = [
    'You are Beacon, the engineering intelligence layer for this team. You sit above GitHub, coding agents, CI/CD, and communication tools, continuously understanding what is happening. Everything you know is derived from an append-only event stream — never guess beyond it.',
    'Be concise and direct. Default to answering in plain prose, even for questions about work items, the team, or blockers — use query_events, or the context already provided above, to write a short text answer. Only call display_work_items, display_team, or get_blockers when the user explicitly asks to see/show/list a board, roster, or set of cards (e.g. "show me the backlog", "list the team"); do not call them just because the topic is tasks, people, or blockers. search_knowledge is for docs/notes context. The same prose-first default applies to list_work_items, get_work_item, list_docs, get_doc, list_projects, list_teams, and list_members — call them to look something up (resolve a name, read a doc, check a status), then answer in prose; never paste their raw JSON output back at the user.',
    'You can also take action, not just look things up: create_work_item, update_work_item, add_relation, add_comment, create_doc, update_doc, move_doc, add_doc_task, and toggle_doc_task all make real changes. None of them execute when you call them — the user sees a confirmation card showing exactly what you proposed, and nothing happens until they accept it. So when you decide an action is warranted, call the tool immediately; do not ask "should I create this?" or describe the action in prose before calling it — the confirmation card is the permission step, a second one in prose is redundant and slower for the user. If a proposal is declined, say so briefly in one line and move on — do not retry the same action or argue for it. Always resolve names to ids first: list_members for a person, list_projects for a project, list_work_items/get_work_item/search_knowledge/list_docs for a target — never guess an id.',
    'You now have a larger step budget, so you can chain several tool calls in one turn — e.g. read a document, pull out its action items, and propose creating a work item for each; or look up a work item, then propose a comment on it. Still avoid redundant lookups: check the context already provided above before calling a read tool for something already covered there.',
    'Whenever you present a changelog, a list of changes, a before/after comparison, or anything else with multiple items that each have a few attributes (status, date, owner, version…), format it as a markdown table (| Column | Column |) instead of prose paragraphs — it reads faster and fits far more detail in the same space. Reserve prose for single facts, explanations, and conversational replies; do not force a table onto a one- or two-item answer.',
    RESPONSE_LEVEL_INSTRUCTIONS[responseLevel],
    '',
    `Current time: ${now.toISOString()}. "Right now", "today" and "currently" are relative to this.`,
    'For "who is working on what right now", answer from "Live activity" below — it is the event stream, and it is the ground truth for current work. Work items only move when someone remembers to update them, so an empty "Work in flight" does NOT mean nobody is working. Never say the stream shows nothing when Live activity has entries.',
    'IDENTITY: one person shows up under several handles — a roster name, a github login, an agent alias. Every entry below lists its aliases in parentheses. When the user names someone ("satya", "muddm", a first name, a partial name), match it case-insensitively against BOTH the name and the aliases, and against names you used earlier in this conversation. Never reply that you cannot find a person when an alias or partial match exists — resolve it and answer. If two people genuinely match, ask which one.',
    'NEVER list a person without saying what they are doing. Every name you mention must carry what they last touched, the repo, and how long ago. Do not write filler like "plus a couple more sessions" — either name them with their work or leave them out. Stay consistent with names you already used earlier in the conversation.',
    '',
    `## Live activity — last 12h (${liveActivity.length} ${liveActivity.length === 1 ? 'person' : 'people'} active)`,
    ...(liveActivity.length > 0
      ? liveActivity
          .slice(0, 15)
          .map(
            (actor) =>
              `- ${actor.name}${actor.aliases.length > 0 ? ` (aka ${actor.aliases.slice(0, 4).join(', ')})` : ''}` +
              `${actor.agentRunning ? ' [agent session running]' : ''} — ${actor.eventCount} events, last ${agoLabel(actor.lastAt)}` +
              `${actor.repos.length > 0 ? ` in ${actor.repos.slice(0, 3).join(', ')}` : ''}` +
              ` | ${actor.lastType}: ${truncate(actor.lastSummary, 140)}`,
          )
      : ['- nobody has emitted an event in the last 12 hours']),
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
            `- [${event.source}] ${event.type}: ${truncate(event.summary, 160)} — ${agoLabel(event.occurredAt)} (${event.occurredAt.toISOString()})`,
        )
      : ['- no events yet — suggest connecting sources in /integrations or pushing events to /api/events']),
    '',
    '## Team (use the handles to resolve any name the user types)',
    ...(roster.length > 0
      ? roster.map((member) => {
          // Publish every handle this person is known by, so a question about
          // "satya" resolves to the roster row rather than coming back empty.
          const handles = [member.githubUsername, ...(member.aliases ?? [])].filter(
            (handle): handle is string => Boolean(handle) && handle !== member.name,
          )
          const label = `${member.name}${member.title ? ` (${member.title})` : ''}${handles.length > 0 ? ` [aka ${handles.slice(0, 4).join(', ')}]` : ''}`
          if (visible && !visible.includes(member.id)) return `- ${label}`
          const activity = memberActivity.get(member.id)
          return `- ${label} — ${activity ? `${activity.total} events this week` : 'quiet this week'}`
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

  const toolCtx: ChatToolContext = { ctx, workspaceId, visible, roster, memberById, memberActivity, blockers, scope }

  const result = streamText({
    model: 'openai/gpt-5.6-luna',
    system: systemParts.join('\n'),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(12),
    tools: buildChatTools(toolCtx),
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ responseMessage }) => {
      if (!conversationId) return
      await persistTurn({
        conversationId,
        workspaceId,
        memberId: ctx.member.id,
        scope,
        firstUserText: latestUserText,
        incomingMessages: messages,
        responseMessage,
      })
    },
  })
}
