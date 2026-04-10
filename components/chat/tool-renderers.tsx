import { FolderKanban, Users, ListChecks, Loader2, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Shared skeleton
// ---------------------------------------------------------------------------

export function ToolLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// display_projects
// ---------------------------------------------------------------------------

type ProjectItem = {
  id: string
  name: string
  description: string | null
  issueCount: number
}

export function ProjectsDisplay({ output }: { output: { projects: ProjectItem[] } | undefined }) {
  if (!output) return <ToolLoading label="Loading projects…" />

  const { projects } = output
  if (projects.length === 0)
    return <p className="text-sm text-muted-foreground">No projects found.</p>

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
      {projects.map((p) => (
        <div key={p.id} className="rounded-xl border bg-card p-4 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FolderKanban className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium truncate">{p.name}</span>
            </div>
            <Badge variant="secondary" className="flex-shrink-0 text-xs">
              {p.issueCount} open
            </Badge>
          </div>
          {p.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// display_team
// ---------------------------------------------------------------------------

type MemberItem = {
  id: string
  name: string
  role: string | null
  currentWorkload: number | null
  inferredSkills: string[] | null
  avatarUrl: string | null
}

function WorkloadBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.round((value / 10) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-green-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-6 text-right">{value}</span>
    </div>
  )
}

export function TeamDisplay({ output }: { output: { members: MemberItem[] } | undefined }) {
  if (!output) return <ToolLoading label="Loading team…" />

  const { members } = output
  if (members.length === 0)
    return <p className="text-sm text-muted-foreground">No team members found.</p>

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
      {members.map((m) => (
        <div key={m.id} className="rounded-xl border bg-card p-4 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            {m.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatarUrl} alt={m.name} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                {m.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{m.name}</p>
              {m.role && <p className="text-xs text-muted-foreground truncate">{m.role}</p>}
            </div>
          </div>
          {m.currentWorkload != null && m.currentWorkload > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Workload</p>
              <WorkloadBar value={m.currentWorkload} />
            </div>
          )}
          {m.inferredSkills && m.inferredSkills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {m.inferredSkills.slice(0, 4).map((s) => (
                <Badge key={s} variant="outline" className="text-xs px-1.5 py-0">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// display_work_items
// ---------------------------------------------------------------------------

type WorkItem = {
  id: string
  title: string
  status: string
  statusType: string | null
  priority: number | null
  priorityLabel: string
  assigneeName: string | null
  dueDate: string | null
  linearUrl: string | null
  projectName: string
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'text-red-600 dark:text-red-400',
  high: 'text-orange-500 dark:text-orange-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  low: 'text-blue-500 dark:text-blue-400',
  none: 'text-muted-foreground',
}

export function WorkItemsDisplay({ output }: { output: { items: WorkItem[] } | undefined }) {
  if (!output) return <ToolLoading label="Loading work items…" />

  const { items } = output
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">No work items found.</p>

  return (
    <div className="w-full border rounded-xl overflow-hidden">
      <div className="divide-y">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 px-4 py-3 bg-card hover:bg-accent/30 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn('text-xs font-medium', PRIORITY_COLOR[item.priorityLabel] ?? 'text-muted-foreground')}>
                  {item.priorityLabel !== 'none' ? `[${item.priorityLabel}]` : ''}
                </span>
                <span className="text-sm font-medium truncate">{item.title}</span>
                {item.linearUrl && (
                  <a
                    href={item.linearUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground flex-shrink-0"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  {item.status}
                </Badge>
                {item.projectName && (
                  <span className="text-xs text-muted-foreground">{item.projectName}</span>
                )}
                {item.assigneeName && (
                  <span className="text-xs text-muted-foreground">@{item.assigneeName}</span>
                )}
                {item.dueDate && (
                  <span className="text-xs text-muted-foreground">
                    due{' '}
                    {new Date(item.dueDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generic fallback for unknown tools
// ---------------------------------------------------------------------------

export function UnknownToolDisplay({ toolName, input }: { toolName: string; input: unknown }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3 text-xs font-mono text-muted-foreground">
      <div className="font-semibold mb-1">{toolName}</div>
      <pre className="overflow-auto">{JSON.stringify(input, null, 2)}</pre>
    </div>
  )
}
