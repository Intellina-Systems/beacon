import { useState } from 'react'
import { AlertTriangle, Loader2, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
// display_team
// ---------------------------------------------------------------------------

type MemberItem = {
  id: string
  name: string
  title: string | null
  avatarUrl: string | null
  weeklyEvents: number | null
  skills: string[] | null
}

export function TeamDisplay({ output }: { output: { members: MemberItem[] } | undefined }) {
  if (!output) return <ToolLoading label="Loading team…" />

  const { members } = output
  if (members.length === 0) return <p className="text-sm text-muted-foreground">No team members found.</p>

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
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{m.name}</p>
              {m.title && <p className="text-xs text-muted-foreground truncate">{m.title}</p>}
            </div>
            <Badge variant={m.weeklyEvents ? 'secondary' : 'outline'} className="text-xs shrink-0">
              {m.weeklyEvents ?? '—'} events
            </Badge>
          </div>
          {m.skills && m.skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {m.skills.slice(0, 4).map((s) => (
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
  identifier: string
  title: string
  description: string | null
  status: string
  priority: number | null
  priorityLabel: string
  assigneeName: string | null
  dueDate: string | null
  url: string | null
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'text-red-600 dark:text-red-400',
  high: 'text-orange-500 dark:text-orange-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  low: 'text-blue-500 dark:text-blue-400',
  none: 'text-muted-foreground',
}

const PRIORITY_ACCENT: Record<string, string> = {
  urgent: 'border-red-500/40 hover:border-red-500/70',
  high: 'border-orange-500/35 hover:border-orange-500/60',
  medium: 'border-yellow-500/35 hover:border-yellow-500/60',
  low: 'border-blue-500/35 hover:border-blue-500/60',
  none: 'border-border hover:border-primary/40',
}

const PRIORITY_RAIL: Record<string, string> = {
  urgent: 'bg-red-500/90',
  high: 'bg-orange-500/90',
  medium: 'bg-yellow-500/90',
  low: 'bg-blue-500/90',
  none: 'bg-muted-foreground/50',
}

function formatDueDate(value: string | null): string | null {
  if (!value) return null

  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function WorkItemsDisplay({ output }: { output: { items: WorkItem[] } | undefined }) {
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null)

  if (!output) return <ToolLoading label="Loading work items…" />

  const { items } = output
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No work items found.</p>

  return (
    <>
      <div className="w-full space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedItem(item)}
            className={cn(
              'w-full rounded-lg border bg-card/80 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
              PRIORITY_ACCENT[item.priorityLabel] ?? PRIORITY_ACCENT.none,
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 h-9 w-1 rounded-full flex-shrink-0',
                  PRIORITY_RAIL[item.priorityLabel] ?? PRIORITY_RAIL.none,
                )}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {item.identifier && (
                      <p className="text-[11px] font-medium tracking-wide text-muted-foreground">{item.identifier}</p>
                    )}
                    <p className="text-sm font-semibold leading-snug mt-0.5 line-clamp-1">{item.title}</p>
                  </div>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground flex-shrink-0"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5">
                    {item.status.replace('_', ' ')}
                  </Badge>
                  <span
                    className={cn(
                      'text-[11px] font-semibold uppercase tracking-wide',
                      PRIORITY_COLOR[item.priorityLabel] ?? 'text-muted-foreground',
                    )}
                  >
                    {item.priorityLabel}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[11px] text-muted-foreground">
                  {item.assigneeName && <span>@{item.assigneeName}</span>}
                  {formatDueDate(item.dueDate) && <span>• due {formatDueDate(item.dueDate)}</span>}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={selectedItem !== null} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedItem?.identifier ? `${selectedItem.identifier}: ` : ''}
              {selectedItem?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedItem?.assigneeName ? `@${selectedItem.assigneeName} • ` : ''}
              {selectedItem?.status.replace('_', ' ')}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/20 p-4 max-h-[55vh] overflow-y-auto">
            {selectedItem?.description?.trim() ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{selectedItem.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description is available for this item.</p>
            )}
          </div>

          <DialogFooter className="sm:justify-start">
            {selectedItem?.url && (
              <Button asChild variant="outline" size="sm">
                <a href={selectedItem.url} target="_blank" rel="noopener noreferrer">
                  Open source
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// get_blockers
// ---------------------------------------------------------------------------

type BlockerItem = {
  summary: string
  type: string
  source: string
  member: string | null
  workItem: string | null
  since: string
}

export function BlockersDisplay({ output }: { output: { blockers: BlockerItem[] } | undefined }) {
  if (!output) return <ToolLoading label="Checking blockers…" />

  if (output.blockers.length === 0) {
    return <p className="text-sm text-muted-foreground">No active blockers. 🎉</p>
  }

  return (
    <div className="w-full space-y-2">
      {output.blockers.map((blocker, index) => (
        <div key={index} className="rounded-lg border border-red-500/40 bg-card px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm leading-snug">{blocker.summary}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {[blocker.member, blocker.workItem, blocker.source].filter(Boolean).join(' · ')} ·{' '}
                {new Date(blocker.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      ))}
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
