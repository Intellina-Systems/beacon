'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { STATUS_META, STATUS_TAB_ORDER } from '@/lib/work-items/constants'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { WorkItemStatus } from '@/lib/db/schema'

/**
 * Multi-select status filter — the individual status toggles used to render
 * as a row of pills that grew with every status a workspace touched. Folding
 * them into one dropdown keeps the filter bar a fixed size regardless of how
 * many statuses are in play, while the All/Open/Completed presets next to it
 * still cover the common cases in one click.
 */
export function StatusFilter({
  current,
  counts,
}: {
  current: Set<WorkItemStatus>
  counts: Map<WorkItemStatus, number>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function toggle(status: WorkItemStatus, checked: boolean) {
    const next = new Set(current)
    if (checked) next.add(status)
    else next.delete(status)
    const params = new URLSearchParams(searchParams.toString())
    if (next.size > 0) params.set('status', [...next].join(','))
    else params.delete('status')
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `/work?${qs}` : '/work')
  }

  const visibleStatuses = STATUS_TAB_ORDER.filter((s) => current.has(s) || (counts.get(s) ?? 0) > 0)
  const label =
    current.size === 0
      ? 'Status'
      : current.size === 1
        ? STATUS_META[[...current][0]].label
        : `${current.size} statuses`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:border-beacon/30">
          {current.size > 0 && (
            <span className="flex -space-x-1">
              {[...current].slice(0, 3).map((s) => (
                <span key={s} className={cn('h-1.5 w-1.5 rounded-full ring-1 ring-card', STATUS_META[s].tone)} />
              ))}
            </span>
          )}
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {visibleStatuses.map((s) => (
          <DropdownMenuCheckboxItem
            key={s}
            checked={current.has(s)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) => toggle(s, checked === true)}
          >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[s].tone)} />
            {STATUS_META[s].label}
            <span className="ml-auto tabular-nums text-muted-foreground">{counts.get(s) ?? 0}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
