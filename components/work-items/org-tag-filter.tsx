'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Option {
  id: string
  name: string
}

/**
 * Generic Engine/Function filter — same URL-driven navigation pattern as
 * AssigneeFilter, parameterized so one component covers both dimensions
 * instead of duplicating near-identical selects.
 */
export function OrgTagFilter({
  options,
  current,
  paramName,
  allLabel,
  basePath = '/work',
}: {
  options: Option[]
  current: string | undefined
  paramName: 'engine' | 'team'
  allLabel: string
  basePath?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function apply(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') params.delete(paramName)
    else params.set(paramName, value)
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  return (
    <Select value={current ?? 'all'} onValueChange={apply}>
      <SelectTrigger size="sm" className="h-7 w-36 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
