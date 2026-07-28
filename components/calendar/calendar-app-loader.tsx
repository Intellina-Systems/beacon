'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import type { CalendarSummary, RosterMember } from './types'

const CalendarApp = dynamic(() => import('./calendar-app').then((m) => m.CalendarApp), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="min-h-0 flex-1" />
    </div>
  ),
})

export function CalendarAppLoader(props: {
  calendars: CalendarSummary[]
  roster: RosterMember[]
  defaultTimezone: string
}) {
  return <CalendarApp {...props} />
}
