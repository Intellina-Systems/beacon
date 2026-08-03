'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserSearch } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RelativeTime } from '@/components/ui/relative-time'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface UnmatchedIdentityRow {
  actorLabel: string
  eventCount: number
  lastSeenAt: string
  suggestedMemberId: string | null
}

export interface MemberOption {
  id: string
  name: string
}

function IdentityRow({
  row,
  members,
  onMapped,
}: {
  row: UnmatchedIdentityRow
  members: MemberOption[]
  onMapped: (actorLabel: string) => void
}) {
  const [selected, setSelected] = useState(row.suggestedMemberId ?? '')
  const [mapping, setMapping] = useState(false)

  async function map() {
    if (!selected) return
    setMapping(true)
    try {
      const res = await fetch(`/api/members/${selected}/link-actor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorLabel: row.actorLabel }),
      })
      if (res.ok) {
        toast.success(`Mapped "${row.actorLabel}"`)
        onMapped(row.actorLabel)
      } else {
        toast.error('Failed to map identity')
      }
    } finally {
      setMapping(false)
    }
  }

  return (
    <div className="flex items-center gap-3 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs font-medium">{row.actorLabel}</p>
        <p className="text-xs text-muted-foreground">
          {row.eventCount} event{row.eventCount === 1 ? '' : 's'} ·{' '}
          <RelativeTime date={row.lastSeenAt} prefix="last " />
        </p>
      </div>
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder="Map to member…" />
        </SelectTrigger>
        <SelectContent>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={!selected || mapping} onClick={map}>
        {mapping ? 'Mapping…' : 'Map'}
      </Button>
    </div>
  )
}

// Every event keeps its raw actor label (events.actorLabel) even when it
// never resolved to a roster member (events.memberId stays null) — this
// surfaces those unresolved labels so an admin can attach them to the right
// person instead of that activity silently going unattributed forever.
export function UnmatchedIdentitiesTable({ rows, members }: { rows: UnmatchedIdentityRow[]; members: MemberOption[] }) {
  const router = useRouter()
  const [resolved, setResolved] = useState<Set<string>>(new Set())

  if (rows.length === 0) return null

  const visible = rows.filter((r) => !resolved.has(r.actorLabel))

  function handleMapped(actorLabel: string) {
    setResolved((prev) => new Set(prev).add(actorLabel))
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserSearch className="h-4 w-4" />
          Unmatched identities
        </CardTitle>
        <CardDescription>
          Activity from names or logins that don&apos;t match anyone on the roster yet — map them so this activity (and
          everything future from the same identity) attributes correctly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">All caught up.</p>
        ) : (
          <div className="divide-y">
            {visible.map((row) => (
              <IdentityRow key={row.actorLabel} row={row} members={members} onMapped={handleMapped} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
