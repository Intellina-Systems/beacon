'use client'

import { useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type Freq = 'none' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

interface Parsed {
  freq: Freq
  interval: number
  byday: string[]
  endMode: 'never' | 'until' | 'count'
  until: string // YYYY-MM-DD
  count: number
}

function parseRule(rrule: string | null, start: Date): Parsed {
  const base: Parsed = {
    freq: 'none',
    interval: 1,
    byday: [WEEKDAYS[start.getDay()]],
    endMode: 'never',
    until: '',
    count: 10,
  }
  if (!rrule) return base
  const parts = Object.fromEntries(
    rrule.split(';').map((p) => {
      const [k, v] = p.split('=')
      return [k.toUpperCase(), v]
    }),
  )
  const freq = (parts.FREQ as Freq) ?? 'none'
  return {
    freq: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq) ? freq : 'none',
    interval: parts.INTERVAL ? Number(parts.INTERVAL) : 1,
    byday: parts.BYDAY ? parts.BYDAY.split(',') : base.byday,
    endMode: parts.UNTIL ? 'until' : parts.COUNT ? 'count' : 'never',
    until: parts.UNTIL ? `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}` : '',
    count: parts.COUNT ? Number(parts.COUNT) : 10,
  }
}

function buildRule(p: Parsed): string | null {
  if (p.freq === 'none') return null
  const segs = [`FREQ=${p.freq}`]
  if (p.interval > 1) segs.push(`INTERVAL=${p.interval}`)
  if (p.freq === 'WEEKLY' && p.byday.length > 0) segs.push(`BYDAY=${p.byday.join(',')}`)
  if (p.endMode === 'until' && p.until) segs.push(`UNTIL=${p.until.replace(/-/g, '')}T235959Z`)
  if (p.endMode === 'count') segs.push(`COUNT=${Math.max(1, p.count)}`)
  return segs.join(';')
}

export function RecurrenceEditor({
  value,
  start,
  onChange,
}: {
  value: string | null
  start: Date
  onChange: (rrule: string | null) => void
}) {
  const parsed = useMemo(() => parseRule(value, start), [value, start])
  const update = (patch: Partial<Parsed>) => onChange(buildRule({ ...parsed, ...patch }))

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select value={parsed.freq} onValueChange={(v) => update({ freq: v as Freq })}>
          <SelectTrigger className="h-8 w-[150px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Does not repeat</SelectItem>
            <SelectItem value="DAILY">Daily</SelectItem>
            <SelectItem value="WEEKLY">Weekly</SelectItem>
            <SelectItem value="MONTHLY">Monthly</SelectItem>
            <SelectItem value="YEARLY">Yearly</SelectItem>
          </SelectContent>
        </Select>

        {parsed.freq !== 'none' && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>every</span>
            <Input
              type="number"
              min={1}
              max={99}
              value={parsed.interval}
              onChange={(e) => update({ interval: Math.max(1, Number(e.target.value) || 1) })}
              className="h-8 w-14"
            />
            <span>{parsed.freq.toLowerCase().replace('ly', parsed.interval > 1 ? 's' : '')}</span>
          </div>
        )}
      </div>

      {parsed.freq === 'WEEKLY' && (
        <div className="flex gap-1">
          {WEEKDAYS.map((day, i) => {
            const on = parsed.byday.includes(day)
            return (
              <button
                key={day}
                type="button"
                onClick={() => update({ byday: on ? parsed.byday.filter((d) => d !== day) : [...parsed.byday, day] })}
                className={cn(
                  'h-7 w-7 rounded-full text-xs font-medium transition-colors',
                  on ? 'bg-beacon text-white' : 'bg-muted text-muted-foreground hover:bg-accent',
                )}
              >
                {WEEKDAY_LABELS[i]}
              </button>
            )
          })}
        </div>
      )}

      {parsed.freq !== 'none' && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Ends</span>
          <Select value={parsed.endMode} onValueChange={(v) => update({ endMode: v as Parsed['endMode'] })}>
            <SelectTrigger className="h-8 w-[110px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">Never</SelectItem>
              <SelectItem value="until">On date</SelectItem>
              <SelectItem value="count">After</SelectItem>
            </SelectContent>
          </Select>
          {parsed.endMode === 'until' && (
            <Input
              type="date"
              value={parsed.until}
              onChange={(e) => update({ until: e.target.value })}
              className="h-8 w-[150px]"
            />
          )}
          {parsed.endMode === 'count' && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Input
                type="number"
                min={1}
                max={999}
                value={parsed.count}
                onChange={(e) => update({ count: Math.max(1, Number(e.target.value) || 1) })}
                className="h-8 w-16"
              />
              <span>occurrences</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
