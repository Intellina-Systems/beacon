'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const VIEWS = [
  { value: 'dayGridMonth', label: 'Month' },
  { value: 'timeGridWeek', label: 'Week' },
  { value: 'timeGridDay', label: 'Day' },
  { value: 'listWeek', label: 'List' },
] as const

export function CalendarToolbar({
  title,
  view,
  onPrev,
  onNext,
  onToday,
  onViewChange,
}: {
  title: string
  view: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onViewChange: (view: string) => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={onToday}>
          Today
        </Button>
        <h2 className="ml-1 text-base font-semibold">{title}</h2>
      </div>

      <Tabs value={view} onValueChange={onViewChange}>
        <TabsList>
          {VIEWS.map((v) => (
            <TabsTrigger key={v.value} value={v.value}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
