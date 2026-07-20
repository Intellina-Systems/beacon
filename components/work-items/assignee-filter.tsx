'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface RosterOption {
  id: string
  name: string
}

/**
 * Navigates on change rather than mutating client state — filters stay in the
 * URL like the status/project tabs, so they're shareable and pagination stays
 * server-driven.
 */
export function AssigneeFilter({ roster, current }: { roster: RosterOption[]; current: string | undefined }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function apply(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') params.delete('assignee')
    else params.set('assignee', value)
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `/work?${qs}` : '/work')
  }

  return (
    <Select value={current ?? 'all'} onValueChange={apply}>
      <SelectTrigger size="sm" className="h-7 w-40 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Anyone</SelectItem>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {roster.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
