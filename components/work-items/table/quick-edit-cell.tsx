import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export const quickEditTriggerClass =
  '-mx-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50'

export function QuickEditCell({
  trigger,
  disabled,
  triggerClassName,
  items,
}: {
  trigger: ReactNode
  disabled?: boolean
  triggerClassName?: string
  items: { key: string; label: ReactNode; onSelect: () => void }[]
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" disabled={disabled} className={cn(quickEditTriggerClass, triggerClassName)}>
          {trigger}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((item) => (
          <DropdownMenuItem key={item.key} onSelect={item.onSelect}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
