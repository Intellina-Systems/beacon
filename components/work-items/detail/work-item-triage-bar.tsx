import { Ban, Check, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function WorkItemTriageBar({
  onTriage,
  onMarkDuplicate,
}: {
  onTriage: (body: Record<string, unknown>) => void
  onMarkDuplicate: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2.5">
      <span className="micro-label mr-1">Triage</span>
      <Button size="sm" onClick={() => onTriage({ action: 'accept' })}>
        <Check className="mr-1.5 h-3.5 w-3.5" />
        Accept
      </Button>
      <Button size="sm" variant="outline" onClick={() => onTriage({ action: 'decline' })}>
        <Ban className="mr-1.5 h-3.5 w-3.5" />
        Decline
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onTriage({ action: 'snooze', until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })}
      >
        <Clock className="mr-1.5 h-3.5 w-3.5" />
        Snooze 1d
      </Button>
      <Button size="sm" variant="outline" onClick={onMarkDuplicate}>
        Mark duplicate
      </Button>
    </div>
  )
}
