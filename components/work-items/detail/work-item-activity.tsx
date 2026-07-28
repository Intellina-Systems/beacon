import { Label } from '@/components/ui/label'
import { RelativeTime } from '@/components/ui/relative-time'
import type { ActivityEvent } from '@/lib/work-items/types'

export function WorkItemActivity({ events }: { events: ActivityEvent[] }) {
  return (
    <section className="space-y-3">
      <Label className="micro-label">Activity</Label>
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      ) : (
        <div className="ml-1 border-l pl-4">
          {events.map((e) => (
            <div key={e.id} className="relative py-2">
              <span className="absolute -left-[19px] top-[13px] h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              <p className="text-sm leading-snug">{e.summary}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-mono text-[11px]">{e.type}</span>
                {(e.memberName ?? e.actorLabel) && (
                  <span className="font-medium text-foreground/70">{e.memberName ?? e.actorLabel}</span>
                )}
                <span className="font-mono text-[11px]">
                  <RelativeTime date={e.occurredAt} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
