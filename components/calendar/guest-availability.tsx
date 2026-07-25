'use client'

import { useState } from 'react'
import { CalendarSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateTime } from 'luxon'

interface Slot {
  start: string
  end: string
}

// "Find a time": asks the server for slots where all invited members are free,
// starting from the event's current start, for its current duration.
export function GuestAvailability({
  memberIds,
  fromISO,
  durationMin,
  timezone,
  onPick,
}: {
  memberIds: string[]
  fromISO: string
  durationMin: number
  timezone: string
  onPick: (startISO: string, endISO: string) => void
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function find() {
    if (memberIds.length === 0) return
    setLoading(true)
    try {
      const rangeStart = new Date(fromISO)
      const rangeEnd = new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000)
      const res = await fetch('/api/calendar/find-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberIds,
          durationMin,
          rangeStart: rangeStart.toISOString(),
          rangeEnd: rangeEnd.toISOString(),
        }),
      })
      const data = (await res.json().catch(() => null)) as { suggestions?: Slot[] } | null
      setSlots(data?.suggestions ?? [])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" onClick={find} disabled={loading || memberIds.length === 0}>
        <CalendarSearch className="mr-1.5 h-3.5 w-3.5" />
        {loading ? 'Finding…' : 'Find a time'}
      </Button>
      {slots && (
        <div className="flex flex-wrap gap-1.5">
          {slots.length === 0 ? (
            <p className="text-xs text-muted-foreground">No free slots in the next two weeks.</p>
          ) : (
            slots.map((s) => (
              <button
                key={s.start}
                type="button"
                onClick={() => onPick(s.start, s.end)}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-beacon/40 hover:text-foreground"
              >
                {DateTime.fromISO(s.start).setZone(timezone).toFormat('ccc d LLL, HH:mm')}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
