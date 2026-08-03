'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export interface UnresolvedYesterday {
  date: string
  intention: string
}

// Two mutually-exclusive prompts, never both at once: an unresolved plan
// from yesterday takes priority (resolving it is a superset concern — it
// also gets today squared away via "Continue"), otherwise a plain nudge if
// today itself has nothing yet. Renders nothing once either is resolved.
export function PlanPrompt({
  todayPlanned,
  yesterday,
}: {
  todayPlanned: boolean
  yesterday: UnresolvedYesterday | null
}) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const storageKey = yesterday ? `plan-prompt-dismissed:${yesterday.date}` : null

  useEffect(() => {
    if (storageKey && window.localStorage.getItem(storageKey) === '1') setDismissed(true)
  }, [storageKey])

  async function continuePlan() {
    if (!yesterday) return
    setBusy(true)
    try {
      const res = await fetch('/api/plans/carry-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate: yesterday.date }),
      })
      if (res.ok) {
        toast.success('Carried yesterday’s plan into today')
        router.refresh()
      } else {
        toast.error('Could not continue that plan')
      }
    } finally {
      setBusy(false)
    }
  }

  async function markYesterdayDone() {
    if (!yesterday) return
    setBusy(true)
    try {
      const res = await fetch('/api/plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: yesterday.date, status: 'done' }),
      })
      if (res.ok) {
        toast.success('Marked yesterday’s plan done')
        router.refresh()
      } else {
        toast.error('Could not update that plan')
      }
    } finally {
      setBusy(false)
    }
  }

  function startFresh() {
    if (storageKey) window.localStorage.setItem(storageKey, '1')
    setDismissed(true)
  }

  if (dismissed) return null

  if (yesterday) {
    return (
      <div className="animate-rise rounded-lg border border-chart-5/40 bg-card p-4 shadow-xs">
        <p className="micro-label flex items-center gap-1.5 text-chart-5">
          <CalendarClock className="h-3.5 w-3.5" />
          Yesterday&apos;s plan is still open
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-snug text-muted-foreground">{yesterday.intention}</p>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={continuePlan}>
            Continue
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={markYesterdayDone}>
            Mark done
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busy} onClick={startFresh}>
            Start fresh
          </Button>
        </div>
      </div>
    )
  }

  if (!todayPlanned) {
    return (
      <div className="rounded-lg border bg-card p-4 shadow-xs">
        <p className="micro-label flex items-center gap-1.5 text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          You haven&apos;t planned today yet
        </p>
      </div>
    )
  }

  return null
}
