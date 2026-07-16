import { createElement } from 'react'
import {
  AlertTriangle,
  Bot,
  BookOpen,
  Calendar,
  CircleCheck,
  CircleDot,
  GitCommit,
  GitMerge,
  GitPullRequest,
  ListTodo,
  MessageSquare,
  Rocket,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { relativeTime } from '@/lib/utils/relative-time'
import { cn } from '@/lib/utils'

const SOURCE_LABEL: Record<string, string> = {
  github: 'GitHub',
  linear: 'Linear',
  cicd: 'CI/CD',
  slack: 'Slack',
  calendar: 'Calendar',
  agent: 'Agent',
  knowledge: 'Knowledge',
  manual: 'Manual',
  system: 'System',
}

function eventIcon(type: string) {
  if (type === 'code.commit') return GitCommit
  if (type === 'pr.merged') return GitMerge
  if (type.startsWith('pr.')) return GitPullRequest
  if (type.startsWith('deploy.')) return Rocket
  if (type === 'ci.failed' || type === 'agent.tests_failed') return XCircle
  if (type === 'ci.passed' || type === 'agent.tests_passed' || type === 'task.completed') return CircleCheck
  if (type.endsWith('.blocked')) return AlertTriangle
  if (type.startsWith('agent.')) return Bot
  if (type.startsWith('task.')) return ListTodo
  if (type.startsWith('message.')) return MessageSquare
  if (type.startsWith('meeting.')) return Calendar
  if (type.startsWith('knowledge.')) return BookOpen
  return CircleDot
}

function eventTone(type: string): string {
  if (type.endsWith('.blocked') || type === 'ci.failed' || type === 'agent.tests_failed' || type === 'deploy.failed') {
    return 'text-red-500'
  }
  if (type === 'pr.merged' || type === 'task.completed' || type === 'ci.passed' || type === 'agent.tests_passed') {
    return 'text-emerald-500'
  }
  return 'text-muted-foreground'
}

export interface EventItemData {
  id: string
  source: string
  type: string
  summary: string
  actorLabel: string | null
  memberName?: string | null
  workItemKey?: string | null
  occurredAt: Date
}

export function EventItem({ event }: { event: EventItemData }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      {createElement(eventIcon(event.type), { className: cn('h-4 w-4 mt-0.5 shrink-0', eventTone(event.type)) })}
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{event.summary}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono text-[11px]">{event.type}</span>
          <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px]">
            {SOURCE_LABEL[event.source] ?? event.source}
          </Badge>
          {event.workItemKey && <span className="font-mono text-[11px]">{event.workItemKey}</span>}
          {(event.memberName ?? event.actorLabel) && (
            <span className="font-medium text-foreground/70">{event.memberName ?? event.actorLabel}</span>
          )}
          <span className="font-mono text-[11px]">{relativeTime(event.occurredAt)}</span>
        </div>
      </div>
    </div>
  )
}
