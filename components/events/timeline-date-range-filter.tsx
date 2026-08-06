'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export function TimelineDateRangeFilter({
  from,
  to,
  basePath = '/timeline',
}: {
  from: string | undefined
  to: string | undefined
  basePath?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [draftFrom, setDraftFrom] = useState(from ?? '')
  const [draftTo, setDraftTo] = useState(to ?? '')
  const [open, setOpen] = useState(false)

  function apply() {
    const params = new URLSearchParams(searchParams.toString())
    if (draftFrom) params.set('from', draftFrom)
    else params.delete('from')
    if (draftTo) params.set('to', draftTo)
    else params.delete('to')
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
    setOpen(false)
  }

  function clear() {
    setDraftFrom('')
    setDraftTo('')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('from')
    params.delete('to')
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
    setOpen(false)
  }

  const active = Boolean(from || to)
  const label = from && to ? `${from} – ${to}` : from ? `From ${from}` : to ? `Until ${to}` : 'Any date'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={active ? 'h-8 gap-1.5 border-beacon/40 bg-beacon/10 text-xs' : 'h-8 gap-1.5 text-xs'}
        >
          <Calendar className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="timeline-from" className="text-xs">
            Start date
          </Label>
          <Input
            id="timeline-from"
            type="date"
            value={draftFrom}
            max={draftTo || undefined}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timeline-to" className="text-xs">
            End date
          </Label>
          <Input
            id="timeline-to"
            type="date"
            value={draftTo}
            min={draftFrom || undefined}
            onChange={(e) => setDraftTo(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clear}>
            Clear
          </Button>
          <Button size="sm" className="h-7 px-3 text-xs" onClick={apply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
