import { GitCommit, GitMerge, GitPullRequest } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ActivityEvent } from '@/lib/work-items/types'

interface PrPayload {
  number: number
  url: string
  title: string
}

interface CommitPayload {
  sha: string
  url: string
  message: string
}

type PrState = 'open' | 'merged' | 'closed'

interface PrGroup {
  number: number
  title: string
  url: string
  state: PrState
}

const STATE_META: Record<PrState, { label: string; className: string }> = {
  open: { label: 'Open', className: 'text-muted-foreground' },
  merged: { label: 'Merged', className: 'text-emerald-500' },
  closed: { label: 'Closed', className: 'text-red-500' },
}

// Groups the item's pr.* events by PR number — a PR usually shows up as
// several events (opened, then merged/closed) as it moves through review;
// this collapses them into one row per PR reflecting its current state.
function groupPrs(events: ActivityEvent[]): PrGroup[] {
  const byNumber = new Map<number, PrGroup>()
  for (const event of events) {
    if (!event.type.startsWith('pr.')) continue
    const payload = event.payload as unknown as PrPayload | null
    if (!payload || typeof payload.number !== 'number') continue

    const observed: PrState = event.type === 'pr.merged' ? 'merged' : event.type === 'pr.closed' ? 'closed' : 'open'
    const existing = byNumber.get(payload.number)
    // A terminal state (merged/closed) always wins over "open", regardless
    // of which event the feed happens to list first.
    const state = existing && existing.state !== 'open' ? existing.state : observed

    byNumber.set(payload.number, { number: payload.number, title: payload.title, url: payload.url, state })
  }
  return Array.from(byNumber.values()).sort((a, b) => b.number - a.number)
}

export function WorkItemGitActivity({ events }: { events: ActivityEvent[] }) {
  const prs = groupPrs(events)
  const commits = events
    .filter((e) => e.type === 'code.commit')
    .map((e) => ({ id: e.id, payload: e.payload as unknown as CommitPayload | null }))
    .filter((c): c is { id: string; payload: CommitPayload } => Boolean(c.payload?.url && c.payload.sha))

  if (prs.length === 0 && commits.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">Linked pull requests</h2>
      </div>

      {prs.length > 0 && (
        <div className="divide-y rounded-lg border">
          {prs.map((pr) => {
            const Icon = pr.state === 'merged' ? GitMerge : GitPullRequest
            return (
              <a
                key={pr.number}
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent/50"
              >
                <Icon className={cn('h-4 w-4 shrink-0', STATE_META[pr.state].className)} />
                <span className="min-w-0 flex-1 truncate">{pr.title}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">#{pr.number}</span>
                <Badge
                  variant="outline"
                  className={cn('shrink-0 px-1.5 py-0 text-[10px]', STATE_META[pr.state].className)}
                >
                  {STATE_META[pr.state].label}
                </Badge>
              </a>
            )
          })}
        </div>
      )}

      {commits.length > 0 && (
        <div className="space-y-0.5">
          {commits.slice(0, 8).map(({ id, payload }) => (
            <a
              key={id}
              href={payload.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded px-1 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              <GitCommit className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0 font-mono">{payload.sha.slice(0, 7)}</span>
              <span className="min-w-0 flex-1 truncate">{payload.message}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
