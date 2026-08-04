'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Share2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { DocPermission, DocShareMode } from '@/lib/db/schema'

interface RosterMember {
  id: string
  name: string
}

interface Collaborator {
  memberId: string
  name: string
  permission: DocPermission
}

const PERMISSION_LABEL: Record<DocPermission, string> = { view: 'Can view', edit: 'Can edit' }

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function ShareDocDialog({ docId, ownerName }: { docId: string; ownerName: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [shareMode, setShareMode] = useState<DocShareMode>('private')
  const [workspacePermission, setWorkspacePermission] = useState<DocPermission>('view')
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [roster, setRoster] = useState<RosterMember[]>([])
  const [addMemberId, setAddMemberId] = useState<string>('')
  const [addPermission, setAddPermission] = useState<DocPermission>('view')
  const [publicShareEnabled, setPublicShareEnabled] = useState(false)
  const [publicShareToken, setPublicShareToken] = useState<string | null>(null)
  const [publicBusy, setPublicBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [inheritedFrom, setInheritedFrom] = useState<{ id: string; title: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    Promise.all([
      fetch(`/api/docs/${docId}/share`).then((res) => res.json()),
      fetch('/api/members').then((res) => res.json()),
    ])
      .then(([shareData, memberData]) => {
        setShareMode(shareData.shareMode)
        setWorkspacePermission(shareData.workspacePermission)
        setCollaborators(shareData.collaborators ?? [])
        setRoster((memberData.members ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })))
        setPublicShareEnabled(shareData.publicShareEnabled ?? false)
        setPublicShareToken(shareData.publicShareToken ?? null)
        setInheritedFrom(shareData.inheritedFrom ?? null)
      })
      .catch(() => toast.error('Failed to load sharing settings'))
      .finally(() => setLoading(false))
  }, [open, docId])

  async function togglePublicShare(next: boolean) {
    setPublicBusy(true)
    const prev = publicShareEnabled
    setPublicShareEnabled(next)
    try {
      const res = await fetch(`/api/docs/${docId}/share`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicShareEnabled: next }),
      })
      if (res.ok) {
        const data = await res.json()
        setPublicShareToken(data.doc?.publicShareToken ?? null)
      } else {
        setPublicShareEnabled(prev)
        toast.error('Failed to update the public link')
      }
    } finally {
      setPublicBusy(false)
    }
  }

  async function copyPublicLink() {
    if (!publicShareToken) return
    const url = `${window.location.origin}/public/docs/${publicShareToken}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function updateGeneralAccess(next: Partial<{ shareMode: DocShareMode; workspacePermission: DocPermission }>) {
    const prevShareMode = shareMode
    const prevPermission = workspacePermission
    if (next.shareMode) setShareMode(next.shareMode)
    if (next.workspacePermission) setWorkspacePermission(next.workspacePermission)
    // A manual change means it's no longer a pristine copy of the parent's
    // settings — clear the inherited badge instantly rather than waiting for
    // a reload to notice the divergence.
    setInheritedFrom(null)
    const res = await fetch(`/api/docs/${docId}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    })
    if (!res.ok) {
      setShareMode(prevShareMode)
      setWorkspacePermission(prevPermission)
      toast.error('Failed to update general access')
    }
  }

  const addableMembers = roster.filter((m) => !collaborators.some((c) => c.memberId === m.id))

  async function addCollaborator() {
    if (!addMemberId) return
    const res = await fetch(`/api/docs/${docId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: addMemberId, permission: addPermission }),
    })
    if (res.ok) {
      const member = roster.find((m) => m.id === addMemberId)
      if (member)
        setCollaborators((prev) => [...prev, { memberId: member.id, name: member.name, permission: addPermission }])
      setAddMemberId('')
      setAddPermission('view')
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to add person')
    }
  }

  async function changePermission(memberId: string, permission: DocPermission) {
    setCollaborators((prev) => prev.map((c) => (c.memberId === memberId ? { ...c, permission } : c)))
    const res = await fetch(`/api/docs/${docId}/share/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission }),
    })
    if (!res.ok) toast.error('Failed to update permission')
  }

  async function removeCollaborator(memberId: string) {
    setCollaborators((prev) => prev.filter((c) => c.memberId !== memberId))
    const res = await fetch(`/api/docs/${docId}/share/${memberId}`, { method: 'DELETE' })
    if (!res.ok) toast.error('Failed to remove person')
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Share2 className="mr-1.5 h-3.5 w-3.5" />
        Share
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share document</DialogTitle>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>People with access</Label>
                <div className="flex items-center gap-2">
                  <Select value={addMemberId} onValueChange={setAddMemberId}>
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue placeholder="Add a person…" />
                    </SelectTrigger>
                    <SelectContent>
                      {addableMembers.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Everyone already has access</div>
                      ) : (
                        addableMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Select value={addPermission} onValueChange={(v) => setAddPermission(v as DocPermission)}>
                    <SelectTrigger className="h-8 w-28 shrink-0 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">Can view</SelectItem>
                      <SelectItem value="edit">Can edit</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8 shrink-0" disabled={!addMemberId} onClick={addCollaborator}>
                    Add
                  </Button>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between rounded-md px-1 py-1">
                    <div className="flex items-center gap-2">
                      <Avatar className="size-6">
                        <AvatarFallback className="text-[10px]">{initials(ownerName)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{ownerName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Owner</span>
                  </div>
                  {collaborators.map((c) => (
                    <div key={c.memberId} className="flex items-center justify-between rounded-md px-1 py-1">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarFallback className="text-[10px]">{initials(c.name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Select
                          value={c.permission}
                          onValueChange={(v) => changePermission(c.memberId, v as DocPermission)}
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="view">Can view</SelectItem>
                            <SelectItem value="edit">Can edit</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground"
                          onClick={() => removeCollaborator(c.memberId)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>General access</Label>
                  {inheritedFrom && (
                    <span className="text-xs text-muted-foreground">
                      Inherited from{' '}
                      <Link href={`/docs/${inheritedFrom.id}`} className="underline hover:text-foreground">
                        {inheritedFrom.title}
                      </Link>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={shareMode}
                    onValueChange={(v) => updateGeneralAccess({ shareMode: v as DocShareMode })}
                  >
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Restricted — only people listed above</SelectItem>
                      <SelectItem value="workspace">Anyone in the workspace</SelectItem>
                    </SelectContent>
                  </Select>
                  {shareMode === 'workspace' && (
                    <Select
                      value={workspacePermission}
                      onValueChange={(v) => updateGeneralAccess({ workspacePermission: v as DocPermission })}
                    >
                      <SelectTrigger className="h-8 w-28 shrink-0 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">Can view</SelectItem>
                        <SelectItem value="edit">Can edit</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {shareMode === 'workspace'
                    ? `Everyone in this workspace can ${PERMISSION_LABEL[workspacePermission].toLowerCase()} this document.`
                    : 'Only you and the people listed above can open this document.'}
                </p>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Anyone with the link</Label>
                    <p className="text-xs text-muted-foreground">
                      Opens outside Beacon — no sign-in, view only, and nothing else in the app is visible to them.
                    </p>
                  </div>
                  <Switch checked={publicShareEnabled} disabled={publicBusy} onCheckedChange={togglePublicShare} />
                </div>
                {publicShareEnabled && publicShareToken && (
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/public/docs/${publicShareToken}`}
                      className="h-8 font-mono text-xs"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={copyPublicLink} className="h-8 shrink-0">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
