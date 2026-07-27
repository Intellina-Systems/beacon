'use client'

import { useState } from 'react'
import { Crown, Plus, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface PickableMember {
  id: string
  name: string
  avatarUrl?: string | null
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * Shared member picker for the engine/team Manage dialogs: a searchable
 * add-member combobox plus the current roster as removable chips. Each chip
 * carries a Crown toggle for lead status — a single-lead caller (engines)
 * enforces exclusivity inside its own `onToggleLead`, a multi-lead caller
 * (teams) just flips that one member. This keeps the interaction identical
 * across both dialogs even though the underlying lead rule differs.
 */
export function MemberPicker({
  roster,
  selection,
  onToggleMember,
  onToggleLead,
  canEditLead = true,
  leadLabel = 'lead',
}: {
  roster: PickableMember[]
  /** memberId -> isLead, for everyone currently selected */
  selection: Map<string, boolean>
  onToggleMember: (id: string) => void
  onToggleLead: (id: string) => void
  canEditLead?: boolean
  leadLabel?: string
}) {
  const [open, setOpen] = useState(false)

  const available = roster.filter((m) => !selection.has(m.id))
  const selected = roster
    .filter((m) => selection.has(m.id))
    .map((m) => ({ ...m, isLead: selection.get(m.id) ?? false }))
    .sort((a, b) => Number(b.isLead) - Number(a.isLead))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Members</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{selected.length} selected</span>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full justify-start font-normal text-muted-foreground"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add member…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search roster…" />
            <CommandList>
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                {roster.length === 0 ? 'No members on the roster yet.' : 'Everyone is already added.'}
              </CommandEmpty>
              <CommandGroup>
                {available.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={m.name}
                    onSelect={() => {
                      onToggleMember(m.id)
                      setOpen(false)
                    }}
                  >
                    <Avatar className="h-5 w-5 border">
                      <AvatarImage src={m.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="text-[8px] font-medium">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    {m.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          No members yet — add one above.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((m) => (
            <span
              key={m.id}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-1 text-xs',
                m.isLead ? 'border-beacon/40 bg-beacon/10' : 'border-border bg-muted/40',
              )}
            >
              <Avatar className="h-5 w-5">
                <AvatarImage src={m.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-[8px] font-medium">{initials(m.name)}</AvatarFallback>
              </Avatar>
              <span className="max-w-32 truncate font-medium">{m.name}</span>
              {canEditLead ? (
                <button
                  type="button"
                  onClick={() => onToggleLead(m.id)}
                  title={m.isLead ? `Remove ${leadLabel}` : `Make ${leadLabel}`}
                  className={cn(
                    'rounded-full p-0.5 transition-colors',
                    m.isLead ? 'text-beacon' : 'text-muted-foreground/40 hover:text-muted-foreground',
                  )}
                >
                  <Crown className="h-3 w-3" />
                </button>
              ) : (
                m.isLead && <Crown className="h-3 w-3 text-beacon" />
              )}
              <button
                type="button"
                onClick={() => onToggleMember(m.id)}
                title="Remove"
                className="rounded-full p-0.5 text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
