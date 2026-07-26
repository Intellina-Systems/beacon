'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Settings2, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Panel, PanelHeader } from '@/components/page-shell'

export interface OrgUnit {
  id: string
  name: string
  description: string | null
  ownerMemberId: string | null
  ownerName: string | null
  members: { id: string; name: string }[]
}

export interface RosterOption {
  id: string
  name: string
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
  const [ownerMemberId, setOwnerMemberId] = useState(unit.ownerMemberId ?? '')
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set(unit.members.map((m) => m.id)))

  function toggleMember(id: string) {
    setMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const requests: Promise<Response>[] = []

      const ownerChanged = isWorkspaceAdmin && ownerMemberId !== (unit.ownerMemberId ?? '')
      if (name.trim() !== unit.name || description.trim() !== (unit.description ?? '') || ownerChanged) {
        requests.push(
          fetch(`${apiBase}/${unit.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              description: description.trim() || null,
              ...(ownerChanged ? { ownerMemberId: ownerMemberId || null } : {}),
            }),
          }),
        )
      }

      const beforeMembers = new Set(unit.members.map((m) => m.id))
      for (const id of memberIds) {
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
        if (!memberIds.has(id)) {
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage {unit.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Lead</Label>
            <Select
              value={ownerMemberId || 'none'}
              onValueChange={(v) => setOwnerMemberId(v === 'none' ? '' : v)}
              disabled={!isWorkspaceAdmin}
            >
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
            {!isWorkspaceAdmin && (
              <p className="text-xs text-muted-foreground">Only an admin can change who leads this.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Members</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-1.5">
              {roster.length === 0 && (
                <p className="px-1.5 py-1 text-xs text-muted-foreground">No members on the roster yet.</p>
              )}
              {roster.map((member) => (
                <label
                  key={member.id}
                  htmlFor={`unit-member-${member.id}`}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/40"
                >
                  <Checkbox
                    id={`unit-member-${member.id}`}
                    checked={memberIds.has(member.id)}
                    onCheckedChange={() => toggleMember(member.id)}
                  />
                  <span className="text-sm">{member.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
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

function UnitCard({ unit, canManage, onManage }: { unit: OrgUnit; canManage: boolean; onManage: () => void }) {
  return (
    <div className="rounded-lg border bg-card/60 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{unit.name}</p>
          {unit.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{unit.description}</p>}
        </div>
        {canManage && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 p-0 text-muted-foreground"
            onClick={onManage}
            aria-label={`Manage ${unit.name}`}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {unit.ownerName ? (
          <span className="flex items-center gap-1.5" title={`${unit.ownerName} (lead)`}>
            <Avatar className="h-6 w-6 border">
              <AvatarFallback className="text-[9px] font-medium">{initials(unit.ownerName)}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">{unit.ownerName}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">no lead yet</span>
        )}
      </div>

      {unit.members.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {unit.members.slice(0, 4).map((m) => (
            <span key={m.id} className="rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {m.name}
            </span>
          ))}
          {unit.members.length > 4 && (
            <span className="text-[10px] text-muted-foreground">+{unit.members.length - 4} more</span>
          )}
        </div>
      )}
    </div>
  )
}

export function OrgUnitSection({
  label,
  apiBase,
  units,
  roster,
  canCreate,
  manageableIds,
  isWorkspaceAdmin,
}: {
  label: string
  apiBase: string
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
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((unit) => (
            <UnitCard
              key={unit.id}
              unit={unit}
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
