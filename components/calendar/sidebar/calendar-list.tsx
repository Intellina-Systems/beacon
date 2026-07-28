import { Download, MoreHorizontal, Upload } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { CalendarSummary } from '../types'

export function CalendarList({
  calendars,
  hidden,
  onToggleHidden,
  onImport,
  onShare,
  onDelete,
}: {
  calendars: CalendarSummary[]
  hidden: Set<string>
  onToggleHidden: (id: string) => void
  onImport: (id: string) => void
  onShare: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-1">
      {calendars.map((c) => (
        <div key={c.id} className="group flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/50">
          <Checkbox
            checked={!hidden.has(c.id)}
            onCheckedChange={() => onToggleHidden(c.id)}
            className="data-[state=checked]:border-(--cal-color) data-[state=checked]:bg-(--cal-color)"
            style={{ ['--cal-color' as string]: c.color }}
          />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
          <span className="flex-1 truncate">{c.name}</span>
          <DropdownMenu>
            <DropdownMenuTrigger className="text-muted-foreground opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={`/api/calendars/${c.id}/export`} download>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export .ics
                </a>
              </DropdownMenuItem>
              {!c.readOnly && (
                <DropdownMenuItem onClick={() => onImport(c.id)}>
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  Import .ics
                </DropdownMenuItem>
              )}
              {c.mine && <DropdownMenuItem onClick={() => onShare(c.id)}>Share</DropdownMenuItem>}
              {c.mine && !c.isPrimary && (
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(c.id)}>
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  )
}
