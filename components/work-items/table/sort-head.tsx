import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { SortKey } from './types'

export function SortHead({
  sortKey,
  sort,
  dir,
  onToggle,
  className,
  align = 'start',
  children,
}: {
  sortKey: SortKey
  sort?: SortKey
  dir?: 'asc' | 'desc'
  onToggle: (key: SortKey) => void
  className?: string
  align?: 'start' | 'end'
  children: React.ReactNode
}) {
  const active = sort === sortKey
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          '-mx-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground',
          align === 'end' && 'ml-auto',
        )}
      >
        {children}
        {active ? (
          dir === 'desc' ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />
        )}
      </button>
    </TableHead>
  )
}
