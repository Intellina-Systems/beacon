import { Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { GuestAvailability } from '../guest-availability'
import type { AttendeeValue, RosterMember } from '../types'

const RESPONSE_LABEL: Record<string, string> = {
  accepted: '✓',
  declined: '✗',
  tentative: '?',
  needsAction: '·',
}

export function GuestPicker({
  guests,
  onGuestsChange,
  guestInput,
  onGuestInputChange,
  guestPickerOpen,
  onGuestPickerOpenChange,
  isEmail,
  availableRoster,
  onPickMember,
  onAddEmail,
  guestMemberIds,
  startISO,
  durationMin,
  timezone,
  onPickAvailability,
}: {
  guests: AttendeeValue[]
  onGuestsChange: (guests: AttendeeValue[]) => void
  guestInput: string
  onGuestInputChange: (value: string) => void
  guestPickerOpen: boolean
  onGuestPickerOpenChange: (open: boolean) => void
  isEmail: boolean
  availableRoster: RosterMember[]
  onPickMember: (member: RosterMember) => void
  onAddEmail: () => void
  guestMemberIds: string[]
  startISO: string
  durationMin: number
  timezone: string
  onPickAvailability: (startISO: string, endISO: string) => void
}) {
  return (
    <div className="flex items-start gap-2">
      <Users className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 space-y-2">
        <Popover open={guestPickerOpen} onOpenChange={onGuestPickerOpenChange}>
          <PopoverTrigger asChild>
            <Input
              value={guestInput}
              onChange={(e) => {
                onGuestInputChange(e.target.value)
                onGuestPickerOpenChange(true)
              }}
              onFocus={() => onGuestPickerOpenChange(true)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAddEmail())}
              placeholder="Add guests (teammate or email)"
              className="h-8"
            />
          </PopoverTrigger>
          <PopoverContent
            className="w-(--radix-popover-trigger-width) p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandList>
                <CommandEmpty>
                  {isEmail ? (
                    <Button type="button" variant="ghost" size="sm" onClick={onAddEmail}>
                      Add &ldquo;{guestInput.trim()}&rdquo;
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">No teammate found.</span>
                  )}
                </CommandEmpty>
                {availableRoster.length > 0 && (
                  <CommandGroup>
                    {availableRoster.map((m) => (
                      <CommandItem key={m.id} value={m.id} onSelect={() => onPickMember(m)}>
                        <span>{m.name}</span>
                        {m.email && <span className="text-muted-foreground">{m.email}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {guests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {guests.map((g, i) => (
              <span
                key={g.memberId ?? g.email ?? i}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2 pr-1 text-xs"
              >
                {g.responseStatus ? (
                  <span className="text-muted-foreground">{RESPONSE_LABEL[g.responseStatus] ?? '·'}</span>
                ) : null}
                {g.name ?? g.email}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                  onClick={() => onGuestsChange(guests.filter((_, j) => j !== i))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </span>
            ))}
          </div>
        )}
        {guestMemberIds.length > 0 && (
          <GuestAvailability
            memberIds={guestMemberIds}
            fromISO={startISO}
            durationMin={durationMin}
            timezone={timezone}
            onPick={onPickAvailability}
          />
        )}
      </div>
    </div>
  )
}
