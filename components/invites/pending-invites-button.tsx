'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2, MailWarning, RotateCw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

interface PendingInvite {
  id: string
  memberId: string
  memberName: string
  memberRole: 'admin' | 'manager' | 'engineer'
  email: string | null
  invitedByName: string | null
  expiresAt: string
  createdAt: string
}

function expiryLabel(expiresAt: string): { text: string; expired: boolean } {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return { text: 'Expired', expired: true }
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return { text: `Expires in ${Math.max(1, Math.floor(ms / 60_000))}m`, expired: false }
  if (hours < 48) return { text: `Expires in ${hours}h`, expired: false }
  return { text: `Expires in ${Math.floor(hours / 24)}d`, expired: false }
}

export function PendingInvitesButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/invites')
      if (!res.ok) throw new Error('Could not load invites')
      const data = await res.json()
      setInvites(data.invites ?? [])
    } catch {
      setError('Could not load pending invites.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Keep the badge count accurate without opening the sheet.
  useEffect(() => {
    void load()
  }, [load])

  // The original link is unrecoverable — only its hash is stored — so this
  // revokes the outstanding token and hands back a freshly minted one.
  async function copyNewLink(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/invites/${id}/regenerate`, { method: 'POST' })
      if (!res.ok) throw new Error('regenerate failed')
      const data = await res.json()
      await navigator.clipboard.writeText(data.invite.url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
      await load()
      router.refresh()
    } catch {
      setError('Could not create a new link.')
    } finally {
      setBusyId(null)
    }
  }

  async function revoke(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/invites/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('revoke failed')
      setInvites((prev) => prev.filter((i) => i.id !== id))
      router.refresh()
    } catch {
      setError('Could not revoke that invite.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void load()
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <MailWarning className="size-4" />
          Pending
          {invites.length > 0 && (
            <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[11px] tabular-nums">
              {invites.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Pending invites</SheetTitle>
          <SheetDescription>
            Join links are stored hashed and can&apos;t be shown again. Copying gives you a new link and retires the old
            one.
          </SheetDescription>
        </SheetHeader>

        {error && (
          <p className="mx-4 mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="scrollbar-hide min-h-0 flex-1 overflow-auto px-4 pb-4">
          {loading && invites.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No invites waiting to be accepted.</p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {invites.map((invite) => {
                const expiry = expiryLabel(invite.expiresAt)
                const busy = busyId === invite.id
                return (
                  <li key={invite.id} className="flex items-start gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{invite.memberName}</span>
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] capitalize">
                          {invite.memberRole}
                        </Badge>
                      </div>
                      {invite.email && <p className="truncate text-xs text-muted-foreground">{invite.email}</p>}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        <span className={cn(expiry.expired && 'text-destructive')}>{expiry.text}</span>
                        {invite.invitedByName && <> · invited by {invite.invitedByName}</>}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={busy}
                        onClick={() => void copyNewLink(invite.id)}
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : copiedId === invite.id ? (
                          <Check className="size-3.5" />
                        ) : expiry.expired ? (
                          <RotateCw className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        {copiedId === invite.id ? 'Copied' : expiry.expired ? 'New link' : 'Copy link'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        aria-label={`Revoke invite for ${invite.memberName}`}
                        onClick={() => void revoke(invite.id)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
