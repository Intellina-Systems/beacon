'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Crown, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type AccessRole = 'admin' | 'manager' | 'engineer'

export interface TeamOption {
  id: string
  name: string
}

export function AddMemberButton({ teams }: { teams: TeamOption[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [githubUsername, setGithubUsername] = useState('')
  const [accessRole, setAccessRole] = useState<AccessRole>('engineer')
  const [withInvite, setWithInvite] = useState(true)
  // teamId -> isLead
  const [teamSelection, setTeamSelection] = useState<Map<string, boolean>>(new Map())
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function reset() {
    setName('')
    setEmail('')
    setTitle('')
    setGithubUsername('')
    setAccessRole('engineer')
    setWithInvite(true)
    setTeamSelection(new Map())
    setInviteUrl(null)
    setCopied(false)
    setError(null)
  }

  function toggleTeam(teamId: string) {
    setTeamSelection((prev) => {
      const next = new Map(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.set(teamId, false)
      return next
    })
  }

  function toggleLead(teamId: string) {
    setTeamSelection((prev) => {
      const next = new Map(prev)
      if (next.has(teamId)) next.set(teamId, !next.get(teamId))
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    const teamAssignments = [...teamSelection.entries()].map(([teamId, isLead]) => ({ teamId, isLead }))
    try {
      if (withInvite) {
        const res = await fetch('/api/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email: email || undefined,
            title: title || undefined,
            githubUsername: githubUsername || undefined,
            accessRole,
            teams: teamAssignments,
          }),
        })
        const data = (await res.json().catch(() => null)) as { invite?: { url: string }; error?: string } | null
        if (res.ok && data?.invite) {
          setInviteUrl(data.invite.url)
          router.refresh()
        } else {
          setError(data?.error ?? 'Failed to create invite')
        }
      } else {
        const res = await fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, title, githubUsername }),
        })
        const data = (await res.json().catch(() => null)) as { member?: { id: string }; error?: string } | null
        if (res.ok && data?.member) {
          await Promise.all(
            teamAssignments.map((t) =>
              fetch(`/api/teams/${t.teamId}/members`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberId: data.member!.id, isLead: t.isLead }),
              }),
            ),
          )
          setOpen(false)
          reset()
          router.refresh()
        } else {
          setError(data?.error ?? 'Failed to add member')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function copyLink() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4 mr-2" />
        Add Member
      </Button>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) reset()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{inviteUrl ? 'Invite link ready' : 'Add team member'}</DialogTitle>
          </DialogHeader>

          {inviteUrl ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Share this one-time link with <span className="font-medium text-foreground">{name}</span>. It expires
                in 7 days; they sign in with GitHub and land in your workspace as{' '}
                <span className="font-medium text-foreground">{accessRole}</span>.
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteUrl} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button type="button" variant="outline" size="sm" onClick={copyLink} className="shrink-0">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    reset()
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Engineer, PM…"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="github">GitHub username</Label>
                  <Input
                    id="github"
                    value={githubUsername}
                    onChange={(e) => setGithubUsername(e.target.value)}
                    placeholder="janesmith"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Access role</Label>
                  <Select value={accessRole} onValueChange={(value) => setAccessRole(value as AccessRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="engineer">Engineer</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {teams.length > 0 && (
                <div className="space-y-2">
                  <Label>Teams</Label>
                  <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                    {teams.map((team) => {
                      const onTeam = teamSelection.has(team.id)
                      const isLead = teamSelection.get(team.id) ?? false
                      return (
                        <div key={team.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`add-team-${team.id}`}
                            checked={onTeam}
                            onCheckedChange={() => toggleTeam(team.id)}
                          />
                          <label htmlFor={`add-team-${team.id}`} className="flex-1 cursor-pointer text-sm">
                            {team.name}
                          </label>
                          {onTeam && (
                            <button
                              type="button"
                              onClick={() => toggleLead(team.id)}
                              className={
                                isLead
                                  ? 'flex items-center gap-1 rounded border border-beacon/40 bg-beacon/10 px-1.5 py-0.5 text-[10px] font-medium text-beacon'
                                  : 'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground'
                              }
                            >
                              <Crown className="h-3 w-3" />
                              Lead
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="with-invite"
                  checked={withInvite}
                  onCheckedChange={(value) => setWithInvite(value === true)}
                />
                <label htmlFor="with-invite" className="cursor-pointer text-sm">
                  Create invite link so they can sign in
                </label>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !name.trim()}>
                  {loading ? 'Adding…' : withInvite ? 'Add & create link' : 'Add member'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
