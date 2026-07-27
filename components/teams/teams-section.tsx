'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Crown, Plus, Settings2, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Panel, PanelHeader } from '@/components/page-shell'

export interface TeamWithMembers {
  id: string
  name: string
  description: string | null
  kind: 'engineering' | 'non_technical'
  members: { id: string; name: string; avatarUrl: string | null; isLead: boolean }[]
}

export interface RosterMember {
  id: string
  name: string
  avatarUrl: string | null
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function NewTeamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'engineering' | 'non_technical'>('engineering')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, kind }),
      })
      if (res.ok) {
        onOpenChange(false)
        setName('')
        setDescription('')
        setKind('engineering')
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
          <DialogTitle>New team</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Name *</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Platform"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-description">Description</Label>
            <Input
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this team owns"
            />
          </div>
          <div className="space-y-2">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="engineering">Engineering</SelectItem>
                <SelectItem value="non_technical">Non-technical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Creating…' : 'Create team'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ManageTeamDialog({
  team,
  roster,
  onOpenChange,
}: {
  team: TeamWithMembers
  roster: RosterMember[]
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [selection, setSelection] = useState<Map<string, boolean>>(
    // memberId -> isLead for members currently on the team
    new Map(team.members.map((m) => [m.id, m.isLead])),
  )

  function toggleMember(memberId: string) {
    setSelection((prev) => {
      const next = new Map(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.set(memberId, false)
      return next
    })
  }

  function toggleLead(memberId: string) {
    setSelection((prev) => {
      const next = new Map(prev)
      if (next.has(memberId)) next.set(memberId, !next.get(memberId))
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const before = new Map(team.members.map((m) => [m.id, m.isLead]))
      const requests: Promise<Response>[] = []
      for (const [memberId, isLead] of selection) {
        if (!before.has(memberId) || before.get(memberId) !== isLead) {
          requests.push(
            fetch(`/api/teams/${team.id}/members`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ memberId, isLead }),
            }),
          )
        }
      }
      for (const memberId of before.keys()) {
        if (!selection.has(memberId)) {
          requests.push(fetch(`/api/teams/${team.id}/members?memberId=${memberId}`, { method: 'DELETE' }))
        }
      }
      await Promise.all(requests)
      onOpenChange(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteTeam() {
    if (!confirm(`Delete team "${team.name}"? Members are kept, only the grouping is removed.`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/teams/${team.id}`, { method: 'DELETE' })
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage {team.name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {roster.length === 0 && <p className="text-sm text-muted-foreground">No members on the roster yet.</p>}
          {roster.map((member) => {
            const onTeam = selection.has(member.id)
            const isLead = selection.get(member.id) ?? false
            return (
              <div key={member.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/40">
                <Checkbox id={`tm-${member.id}`} checked={onTeam} onCheckedChange={() => toggleMember(member.id)} />
                <label htmlFor={`tm-${member.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                  <Avatar className="h-6 w-6 border">
                    <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback className="text-[9px] font-medium">{initials(member.name)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{member.name}</span>
                </label>
                {onTeam && (
                  <button
                    type="button"
                    onClick={() => toggleLead(member.id)}
                    className={
                      isLead
                        ? 'flex items-center gap-1 rounded border border-beacon/40 bg-beacon/10 px-1.5 py-0.5 text-[10px] font-medium text-beacon'
                        : 'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground'
                    }
                    title={isLead ? 'Remove lead' : 'Make lead'}
                  >
                    <Crown className="h-3 w-3" />
                    Lead
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={handleDeleteTeam}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete team
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TeamsSection({
  teams,
  roster,
  canManage,
  scopedToSelf = false,
}: {
  teams: TeamWithMembers[]
  roster: RosterMember[]
  canManage: boolean
  /** True when this list has already been narrowed to "your teams only" (a
   * plain employee's view) — changes the empty-state copy so it doesn't read
   * as "no teams exist" when really it's "you're not on one yet." */
  scopedToSelf?: boolean
}) {
  const [newOpen, setNewOpen] = useState(false)
  const [managing, setManaging] = useState<TeamWithMembers | null>(null)

  return (
    <Panel>
      <PanelHeader
        label={scopedToSelf ? 'Your teams' : 'Teams'}
        meta={
          canManage ? (
            <Button variant="outline" size="sm" className="h-7" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              New team
            </Button>
          ) : undefined
        }
      />
      {teams.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {scopedToSelf
            ? "You're not on a team yet — an admin can add you."
            : `No teams yet${canManage ? ' — create one to group members and assign leads.' : '.'}`}
        </p>
      ) : (
        <div className="scrollbar-hide grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
          {teams.map((team) => (
            <div
              key={team.id}
              className="group relative rounded-lg border bg-card/60 p-3.5 transition-colors hover:border-beacon/40 hover:bg-accent/30"
            >
              <Link href={`/org/team/${team.id}`} className="absolute inset-0 z-0 rounded-lg" aria-label={`View ${team.name}`} />

              <div className="relative flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{team.name}</p>
                  {team.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{team.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {team.kind === 'non_technical' && (
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      non-tech
                    </Badge>
                  )}
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="relative z-10 h-6 w-6 p-0 text-muted-foreground"
                      onClick={() => setManaging(team)}
                      aria-label={`Manage ${team.name}`}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                </div>
              </div>
              <div className="relative mt-3 flex items-center gap-1.5">
                {team.members.length === 0 ? (
                  <span className="text-xs text-muted-foreground/60">no members</span>
                ) : (
                  <>
                    <div className="flex -space-x-1.5">
                      {team.members.slice(0, 6).map((member) => (
                        <span
                          key={member.id}
                          className="relative inline-flex"
                          title={member.name + (member.isLead ? ' (lead)' : '')}
                        >
                          <Avatar className="h-6 w-6 border bg-background">
                            <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                            <AvatarFallback className="text-[9px] font-medium">{initials(member.name)}</AvatarFallback>
                          </Avatar>
                          {member.isLead && (
                            <Crown className="absolute -right-0.5 -top-1 h-2.5 w-2.5 text-beacon" strokeWidth={2.5} />
                          )}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {team.members.length} member{team.members.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <NewTeamDialog open={newOpen} onOpenChange={setNewOpen} />
      {managing && <ManageTeamDialog team={managing} roster={roster} onOpenChange={() => setManaging(null)} />}
    </Panel>
  )
}
