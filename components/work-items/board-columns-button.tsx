'use client'

import { Columns3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_META } from '@/lib/work-items/constants'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BOARD_STATUSES, useBoardColumns } from './board-columns-context'

export function BoardColumnsButton() {
  const { hiddenColumns, toggleColumn } = useBoardColumns()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1.5 px-2 text-xs">
          <Columns3 className="h-3.5 w-3.5" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {BOARD_STATUSES.map((s) => (
          <DropdownMenuCheckboxItem
            key={s}
            checked={!hiddenColumns.has(s)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggleColumn(s)}
          >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[s].tone)} />
            {STATUS_META[s].label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
