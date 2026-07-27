'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Option {
  id: string
  name: string
}

/**
 * Generic Project/Engine/Function filter — same URL-driven navigation pattern
 * as AssigneeFilter, parameterized so one component covers all three
 * dimensions instead of duplicating near-identical selects.
 */
export function OrgTagFilter({
  options,
  current,
  paramName,
  allLabel,
  basePath = '/work',
  className,
}: {
  options: Option[]
  current: string | undefined
  paramName: 'project' | 'engine' | 'team'
  allLabel: string
  basePath?: string
  className?: string
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
      <SelectTrigger size="sm" className={cn('h-7 w-36 text-xs', className)}>
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
