'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface RosterOption {
  id: string
  name: string
}

/**
 * Admin/manager-only: filter a page's list down to one person. Shared by
 * Timeline and Plans (basePath picks the route); pages that don't resolve
 * this role never render the control, so there's nothing to apply even if
 * the URL is hand-edited.
 */
export function TimelinePersonFilter({
  roster,
  current,
  basePath = '/timeline',
}: {
  roster: RosterOption[]
  current: string | undefined
  basePath?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function apply(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') params.delete('member')
    else params.set('member', value)
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  return (
    <Select value={current ?? 'all'} onValueChange={apply}>
      <SelectTrigger size="sm" className="h-8 w-44 text-xs">
        <SelectValue placeholder="Everyone" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Everyone</SelectItem>
        {roster.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
