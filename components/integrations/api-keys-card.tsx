'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { relativeTime } from '@/lib/utils/relative-time'

interface KeyRow {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export function ApiKeysCard({ keys }: { keys: KeyRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function create() {
    setCreating(true)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setCreatedKey(data.key)
        router.refresh()
      } else {
        toast.error(data.error ?? 'Failed to create key')
      }
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Key revoked')
      router.refresh()
    } else {
      toast.error('Failed to revoke key')
    }
  }

  function copyKey() {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function closeDialog() {
    setOpen(false)
    setName('')
    setCreatedKey(null)
  }

  const activeKeys = keys.filter((key) => !key.revokedAt)

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            API keys
          </CardTitle>
          <CardDescription>Let coding agents, CI, and plugins push events to Beacon.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New key
        </Button>
      </CardHeader>
      <CardContent>
        {activeKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No API keys yet.</p>
        ) : (
          <div className="divide-y">
            {activeKeys.map((key) => (
              <div key={key.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{key.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {key.keyPrefix}…
                    <span className="font-sans">
                      {' · '}
                      {key.lastUsedAt ? `used ${relativeTime(new Date(key.lastUsedAt))}` : 'never used'}
                    </span>
                  </p>
                </div>
                <Badge variant="outline">Active</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => revoke(key.id)}
                  title="Revoke"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(value) => !value && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdKey ? 'Copy your key' : 'Create API key'}</DialogTitle>
          </DialogHeader>
          {createdKey ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This is the only time the full key is shown. Store it somewhere safe.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={createdKey} className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={copyKey}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <Button onClick={closeDialog} className="w-full">
                Done
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                placeholder="e.g. claude-code, ci-pipeline"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button onClick={create} disabled={!name.trim() || creating} className="w-full">
                {creating ? 'Creating…' : 'Create key'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
