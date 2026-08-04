'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowUpDown } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SortKey } from './table/types'

// Combines sort+dir into one option since they're only ever meaningful
// together here (there's no "priority ascending" a user would reach for).
const OPTIONS: { value: string; sort: SortKey; dir: 'asc' | 'desc'; label: string }[] = [
  { value: 'created-desc', sort: 'created', dir: 'desc', label: 'Newest first' },
  { value: 'created-asc', sort: 'created', dir: 'asc', label: 'Oldest first' },
  { value: 'activity-desc', sort: 'activity', dir: 'desc', label: 'Recently updated' },
  { value: 'priority-desc', sort: 'priority', dir: 'desc', label: 'Priority' },
  { value: 'manual-asc', sort: 'manual', dir: 'asc', label: 'Manual order' },
]

export function SortMenu({ sort, dir }: { sort: SortKey; dir: 'asc' | 'desc' }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const current = OPTIONS.find((o) => o.sort === sort && o.dir === dir)?.value ?? `${sort}-${dir}`

  function apply(value: string) {
    const option = OPTIONS.find((o) => o.value === value)
    if (!option) return
    const params = new URLSearchParams(searchParams.toString())
    // Newest-first is the default the page falls back to on its own —
    // leaving it out of the URL keeps a plain /work link clean.
    if (option.sort === 'created' && option.dir === 'desc') {
      params.delete('sort')
      params.delete('dir')
    } else {
      params.set('sort', option.sort)
      params.set('dir', option.dir)
    }
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `/work?${qs}` : '/work')
  }

  return (
    <Select value={current} onValueChange={apply}>
      <SelectTrigger size="sm" className="h-7 w-40 text-xs">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
