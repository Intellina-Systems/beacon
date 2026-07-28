import { Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  RESPONSE_LEVELS,
  RESPONSE_LEVEL_LABELS,
  RESPONSE_LEVEL_DESCRIPTIONS,
  type ResponseLevel,
} from '@/lib/chat/response-level'

export function ResponseLevelMenu({
  level,
  onChange,
}: {
  level: ResponseLevel
  onChange: (level: ResponseLevel) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 flex-shrink-0" title="Response detail">
          <Gauge className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Response detail</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={level} onValueChange={(v) => onChange(v as ResponseLevel)}>
          {RESPONSE_LEVELS.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} className="cursor-pointer flex-col items-start gap-0">
              <span>{RESPONSE_LEVEL_LABELS[option]}</span>
              <span className="text-xs text-muted-foreground">{RESPONSE_LEVEL_DESCRIPTIONS[option]}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
