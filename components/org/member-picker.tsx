'use client'

import { useMemo, useState } from 'react'
import { Check, Crown, Search } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
 * Shared member picker for the engine/team Manage dialogs.
 *
 * Deliberately rendered inline — a plain search box over a scrollable list.
 * The previous version used Popover + Command, which portal their content to
 * <body>. Inside a dialog that breaks twice over: Radix reads a click on the
 * portaled list as a click *outside* the dialog and dismisses it (wiping the
 * in-progress selection), and the floating list overflows the dialog with no
 * way to reach the bottom of the roster. Keeping everything in the dialog's own
 * DOM removes both problems by construction rather than patching around them.
 *
 * One list, one interaction: click a row to add or remove; the crown toggles
 * lead. A single-lead caller (engines) enforces exclusivity inside its own
 * `onToggleLead`; a multi-lead caller (teams) just flips that one member.
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
  const [query, setQuery] = useState('')

  // Selected first (leads at the very top), then the rest alphabetically, so
  // the current roster is always visible without scrolling for it.
  const ordered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return roster
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => ({ ...m, isSelected: selection.has(m.id), isLead: selection.get(m.id) ?? false }))
      .sort((a, b) => {
        if (a.isLead !== b.isLead) return Number(b.isLead) - Number(a.isLead)
        if (a.isSelected !== b.isSelected) return Number(b.isSelected) - Number(a.isSelected)
        return a.name.localeCompare(b.name)
      })
  }, [roster, selection, query])

  const selectedCount = selection.size

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Members</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{selectedCount} selected</span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search roster…"
          className="h-8 pl-8 text-sm"
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border">
        {roster.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No members on the roster yet.</p>
        ) : ordered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No one matches “{query.trim()}”.</p>
        ) : (
          <ul className="divide-y">
            {ordered.map((m) => (
              <li key={m.id}>
                <div
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2 text-sm transition-colors',
                    m.isSelected ? 'bg-beacon/5' : 'hover:bg-accent/40',
                  )}
                >
                  {/* The row itself is the toggle; the crown sits outside it so
                      promoting a lead never also removes the member. */}
                  <button
                    type="button"
                    onClick={() => onToggleMember(m.id)}
                    aria-pressed={m.isSelected}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                        m.isSelected ? 'border-beacon bg-beacon text-beacon-foreground' : 'border-input',
                      )}
                    >
                      {m.isSelected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <Avatar className="size-6 border">
                      <AvatarImage src={m.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="text-[9px] font-medium">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <span className={cn('truncate', m.isSelected && 'font-medium')}>{m.name}</span>
                  </button>

                  {m.isSelected &&
                    (canEditLead ? (
                      <button
                        type="button"
                        onClick={() => onToggleLead(m.id)}
                        title={m.isLead ? `Remove ${leadLabel}` : `Make ${leadLabel}`}
                        aria-pressed={m.isLead}
                        className={cn(
                          'shrink-0 rounded-full p-1 transition-colors',
                          m.isLead
                            ? 'text-beacon'
                            : 'text-muted-foreground/40 hover:bg-accent hover:text-muted-foreground',
                        )}
                      >
                        <Crown className="size-3.5" />
                      </button>
                    ) : (
                      m.isLead && <Crown className="size-3.5 shrink-0 text-beacon" />
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedCount === 0 && (
        <p className="text-xs text-muted-foreground">Nobody selected yet — tick someone above.</p>
      )}
    </div>
  )
}
