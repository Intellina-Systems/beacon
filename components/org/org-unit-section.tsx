'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Crown, Plus, Settings2, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Panel, PanelHeader } from '@/components/page-shell'
import { MemberPicker } from '@/components/org/member-picker'

export interface OrgUnit {
  id: string
  name: string
  description: string | null
  ownerMemberId: string | null
  ownerName: string | null
  members: { id: string; name: string; avatarUrl: string | null }[]
}

export interface RosterOption {
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

function NewUnitDialog({
  label,
  apiBase,
  roster,
  open,
  onOpenChange,
}: {
  label: string
  apiBase: string
  roster: RosterOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ownerMemberId, setOwnerMemberId] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          ownerMemberId: ownerMemberId || undefined,
        }),
      })
      if (res.ok) {
        onOpenChange(false)
        setName('')
        setDescription('')
        setOwnerMemberId('')
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New {label.toLowerCase()}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unit-name">Name *</Label>
            <Input id="unit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit-description">Description</Label>
            <Input
              id="unit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`What this ${label.toLowerCase()} covers`}
            />
          </div>
          <div className="space-y-2">
            <Label>Lead</Label>
            <Select value={ownerMemberId || 'none'} onValueChange={(v) => setOwnerMemberId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No lead yet</SelectItem>
                {roster.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Creating…' : `Create ${label.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ManageUnitDialog({
  label,
  apiBase,
  unit,
  roster,
  isWorkspaceAdmin,
  onOpenChange,
}: {
  label: string
  apiBase: string
  unit: OrgUnit
  roster: RosterOption[]
  isWorkspaceAdmin: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(unit.name)
  const [description, setDescription] = useState(unit.description ?? '')
  // memberId -> isLead. The lead lives in a separate column server-side, but
  // in the UI it's just the one chip with its crown lit — selecting a new
  // lead below un-lights the previous one, same interaction as the team
  // dialog's multi-lead toggle, just constrained to one at a time.
  const [selection, setSelection] = useState<Map<string, boolean>>(() => {
    const map = new Map(unit.members.map((m) => [m.id, false]))
    if (unit.ownerMemberId) map.set(unit.ownerMemberId, true)
    return map
  })

  function toggleMember(id: string) {
    setSelection((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, false)
      return next
    })
  }

  function toggleLead(id: string) {
    setSelection((prev) => {
      const wasLead = prev.get(id) ?? false
      const next = new Map(prev)
      for (const key of next.keys()) next.set(key, false)
      if (!wasLead) next.set(id, true)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const requests: Promise<Response>[] = []

      const newOwnerMemberId = [...selection.entries()].find(([, isLead]) => isLead)?.[0] ?? ''
      const ownerChanged = isWorkspaceAdmin && newOwnerMemberId !== (unit.ownerMemberId ?? '')
      if (name.trim() !== unit.name || description.trim() !== (unit.description ?? '') || ownerChanged) {
        requests.push(
          fetch(`${apiBase}/${unit.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              description: description.trim() || null,
              ...(ownerChanged ? { ownerMemberId: newOwnerMemberId || null } : {}),
            }),
          }),
        )
      }

      const beforeMembers = new Set(unit.members.map((m) => m.id))
      for (const id of selection.keys()) {
        if (!beforeMembers.has(id)) {
          requests.push(
            fetch(`${apiBase}/${unit.id}/members`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ memberId: id }),
            }),
          )
        }
      }
      for (const id of beforeMembers) {
        if (!selection.has(id)) {
          requests.push(fetch(`${apiBase}/${unit.id}/members?memberId=${id}`, { method: 'DELETE' }))
        }
      }

      await Promise.all(requests)
      onOpenChange(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${unit.name}"? Tagged work items and knowledge docs keep their history, just lose the tag.`))
      return
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/${unit.id}`, { method: 'DELETE' })
      if (res.ok) {
        onOpenChange(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage {unit.name}</DialogTitle>
          <DialogDescription>Update its details, lead, and roster.</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 space-y-6 overflow-y-auto px-1 py-1">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <MemberPicker
              roster={roster}
              selection={selection}
              onToggleMember={toggleMember}
              onToggleLead={toggleLead}
              canEditLead={isWorkspaceAdmin}
              leadLabel="lead"
            />
            {!isWorkspaceAdmin && (
              <p className="text-xs text-muted-foreground">Only an admin can change who leads this (crown icon).</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 border-t pt-4 sm:justify-between">
          {isWorkspaceAdmin ? (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={handleDelete}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UnitCard({
  unit,
  href,
  canManage,
  onManage,
}: {
  unit: OrgUnit
  href: string
  canManage: boolean
  onManage: () => void
}) {
  // The lead is tracked on the unit itself, not the members list, so they may
  // not be a member — merge them in as the first avatar (matching the team
  // card, where the lead is always part of the members list already).
  const displayMembers = unit.ownerMemberId
    ? [
        {
          id: unit.ownerMemberId,
          name: unit.ownerName ?? '',
          avatarUrl: unit.members.find((m) => m.id === unit.ownerMemberId)?.avatarUrl ?? null,
          isLead: true,
        },
        ...unit.members.filter((m) => m.id !== unit.ownerMemberId).map((m) => ({ ...m, isLead: false })),
      ]
    : unit.members.map((m) => ({ ...m, isLead: false }))

  return (
    <div className="group relative rounded-lg border bg-card/60 p-3.5 transition-colors hover:border-beacon/40 hover:bg-accent/30">
      <Link href={href} className="absolute inset-0 z-0 rounded-lg" aria-label={`View ${unit.name}`} />

      <div className="pointer-events-none relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{unit.name}</p>
            {unit.description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{unit.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                className="pointer-events-auto h-6 w-6 shrink-0 p-0 text-muted-foreground"
                onClick={onManage}
                aria-label={`Manage ${unit.name}`}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </div>
        </div>

        {displayMembers.length > 0 ? (
          <div className="mt-3 flex items-center gap-1.5">
            <div className="flex -space-x-1.5">
              {displayMembers.slice(0, 6).map((m) => (
                <span key={m.id} className="relative inline-flex" title={m.name + (m.isLead ? ' (lead)' : '')}>
                  <Avatar className="h-6 w-6 border bg-background">
                    <AvatarImage src={m.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback className="text-[9px] font-medium">{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  {m.isLead && (
                    <Crown className="absolute -right-0.5 -top-1 h-2.5 w-2.5 text-beacon" strokeWidth={2.5} />
                  )}
                </span>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {displayMembers.length} member{displayMembers.length === 1 ? '' : 's'}
            </span>
          </div>
        ) : (
          <span className="mt-3 block text-xs text-muted-foreground/60">no members yet</span>
        )}
      </div>
    </div>
  )
}

export function OrgUnitSection({
  label,
  apiBase,
  hrefBase,
  units,
  roster,
  canCreate,
  manageableIds,
  isWorkspaceAdmin,
}: {
  label: string
  apiBase: string
  /** Base path for the unit's detail page — each card links to `${hrefBase}/${unit.id}`. */
  hrefBase: string
  units: OrgUnit[]
  roster: RosterOption[]
  canCreate: boolean
  manageableIds: Set<string>
  isWorkspaceAdmin: boolean
}) {
  const [newOpen, setNewOpen] = useState(false)
  const [managing, setManaging] = useState<OrgUnit | null>(null)

  return (
    <Panel>
      <PanelHeader
        label={`${label}s`}
        meta={
          canCreate ? (
            <Button variant="outline" size="sm" className="h-7" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              New {label.toLowerCase()}
            </Button>
          ) : undefined
        }
      />
      {units.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No {label.toLowerCase()}s yet{canCreate ? ` — create one to start mapping your org chart.` : '.'}
        </p>
      ) : (
        <div className="scrollbar-hide grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
          {units.map((unit) => (
            <UnitCard
              key={unit.id}
              unit={unit}
              href={`${hrefBase}/${unit.id}`}
              canManage={manageableIds.has(unit.id)}
              onManage={() => setManaging(unit)}
            />
          ))}
        </div>
      )}

      <NewUnitDialog label={label} apiBase={apiBase} roster={roster} open={newOpen} onOpenChange={setNewOpen} />
      {managing && (
        <ManageUnitDialog
          label={label}
          apiBase={apiBase}
          unit={managing}
          roster={roster}
          isWorkspaceAdmin={isWorkspaceAdmin}
          onOpenChange={() => setManaging(null)}
        />
      )}
    </Panel>
  )
}
