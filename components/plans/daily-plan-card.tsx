'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check, Circle, CircleCheck, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { DailyPlanStatus } from '@/lib/db/schema'

export interface PlanWorkItemOption {
  id: string
  key: string | null
  title: string
}

interface DailyPlanCardProps {
  date: string
  initialIntention: string | null
  initialWorkItemIds: string[]
  initialStatus: DailyPlanStatus
  /** Assigned active items + anything already linked, deduped — the pick list. */
  options: PlanWorkItemOption[]
  /** Today's meeting count from the connected calendar, if any — read-only context. */
  meetingCount?: number
}

export function DailyPlanCard({
  date,
  initialIntention,
  initialWorkItemIds,
  initialStatus,
  options,
  meetingCount,
}: DailyPlanCardProps) {
  const router = useRouter()
  const hasPlan = Boolean(initialIntention)
  const [editing, setEditing] = useState(!hasPlan)
  const [intention, setIntention] = useState(initialIntention ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(initialWorkItemIds))
  const [saving, setSaving] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)

  async function toggleStatus() {
    const nextStatus: DailyPlanStatus = initialStatus === 'done' ? 'pending' : 'done'
    setTogglingStatus(true)
    try {
      const res = await fetch('/api/plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, status: nextStatus }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        toast.error('Could not update plan status')
      }
    } finally {
      setTogglingStatus(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!intention.trim()) {
      toast.error('Say what you plan to work on today')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intention: intention.trim(), workItemIds: [...selected] }),
      })
      if (res.ok) {
        setEditing(false)
        toast.success('Plan saved for today')
        router.refresh()
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(data?.error ?? 'Could not save your plan')
      }
    } finally {
      setSaving(false)
    }
  }

  const label = (item: PlanWorkItemOption) => (item.key ? `${item.key} · ${item.title}` : item.title)

  return (
    <div className="animate-rise rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="micro-label flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          Today&apos;s plan
        </p>
        {typeof meetingCount === 'number' && meetingCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {meetingCount} meeting{meetingCount === 1 ? '' : 's'} today
          </span>
        )}
      </div>

      {!editing ? (
        <div className="mt-2.5">
          <p className="whitespace-pre-wrap text-sm leading-snug">{intention}</p>
          {selected.size > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {options
                .filter((o) => selected.has(o.id))
                .map((o) => (
                  <span
                    key={o.id}
                    className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {o.key ?? o.title}
                  </span>
                ))}
            </div>
          )}
          <div className="mt-2 -ml-2 flex items-center gap-1">
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit plan
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn(initialStatus === 'done' ? 'text-beacon' : 'text-muted-foreground')}
              disabled={togglingStatus}
              onClick={toggleStatus}
            >
              {initialStatus === 'done' ? (
                <>
                  <CircleCheck className="mr-1.5 h-3.5 w-3.5" />
                  Done
                </>
              ) : (
                <>
                  <Circle className="mr-1.5 h-3.5 w-3.5" />
                  Mark done
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 space-y-3">
          <Textarea
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            placeholder="What are you working on today?"
            className="min-h-20 text-sm"
            autoFocus
          />

          {options.length > 0 && (
            <div>
              <p className="micro-label mb-1.5">Link work you&apos;re on</p>
              <div className="flex flex-wrap gap-1.5">
                {options.map((item) => {
                  const on = selected.has(item.id)
                  return (
                    <Button
                      key={item.id}
                      type="button"
                      variant="outline"
                      onClick={() => toggle(item.id)}
                      title={label(item)}
                      className={cn(
                        'h-auto max-w-[240px] rounded-full px-2.5 py-1 text-xs font-normal',
                        on
                          ? 'border-beacon/40 bg-beacon/10 text-foreground hover:bg-beacon/10'
                          : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                      )}
                    >
                      {on && <Check className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{label(item)}</span>
                    </Button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save plan'}
            </Button>
            {hasPlan && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={saving}
                onClick={() => {
                  setIntention(initialIntention ?? '')
                  setSelected(new Set(initialWorkItemIds))
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
