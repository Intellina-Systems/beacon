'use client'

import { useState } from 'react'
import { Activity, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { cn } from '@/lib/utils'
import type { ActivityEvent } from '@/lib/work-items/types'

const COLLAPSED_COUNT = 8

// Colour by what the event means, so a scan of the rail reads as a story:
// green shipped, red broke, indigo moved, grey everything else.
function toneFor(type: string): string {
  if (/(completed|passed|merged|approved|unblocked)$/.test(type)) return 'bg-success'
  if (/(failed|blocked|cancelled|changes_requested)$/.test(type)) return 'bg-destructive'
  if (/^(task\.(started|status_changed|assigned)|sprint\.)/.test(type)) return 'bg-beacon'
  return 'bg-muted-foreground/40'
}

export function WorkItemActivity({ events }: { events: ActivityEvent[] }) {
  const [expanded, setExpanded] = useState(false)

  // Comments have their own section with full markdown and screenshots —
  // repeating "X commented" here would just be noise.
  const feed = events.filter((e) => e.type !== 'task.commented')
  const hidden = Math.max(0, feed.length - COLLAPSED_COUNT)
  const visible = expanded ? feed : feed.slice(0, COLLAPSED_COUNT)

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">
          Activity
          {feed.length > 0 && <span className="ml-1.5 font-normal text-muted-foreground">{feed.length}</span>}
        </h2>
      </div>

      {feed.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3.5 py-4 text-xs text-muted-foreground">
          No activity yet. Events from commits, CI, agents, and status changes land here automatically.
        </p>
      ) : (
        <>
          <ol className="relative ml-[5px] border-l pl-5">
            {visible.map((event) => (
              <li key={event.id} className="relative py-2">
                <span
                  className={cn(
                    'absolute -left-[23px] top-[13px] h-[7px] w-[7px] rounded-full ring-4 ring-background',
                    toneFor(event.type),
                  )}
                />
                <p className="text-[13px] leading-snug">{event.summary}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  {(event.memberName ?? event.actorLabel) && (
                    <span className="font-medium text-foreground/70">{event.memberName ?? event.actorLabel}</span>
                  )}
                  <span className="font-mono">{event.type}</span>
                  <span className="opacity-60">·</span>
                  <RelativeTime date={event.occurredAt} />
                </div>
              </li>
            ))}
          </ol>

          {hidden > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              <ChevronDown className={cn('mr-1 h-3 w-3 transition-transform', expanded && 'rotate-180')} />
              {expanded ? 'Show less' : `Show ${hidden} earlier event${hidden > 1 ? 's' : ''}`}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
