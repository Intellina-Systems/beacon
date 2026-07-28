'use client'

import { useState } from 'react'
import { Check, Copy, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AccessLinkCard({
  memberId,
  memberName,
  hasAccount,
}: {
  memberId: string
  memberName: string
  /** True once the member is bound to a GitHub account. */
  hasAccount: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/members/${memberId}/access-link`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUrl(data.invite.url)
      await navigator.clipboard.writeText(data.invite.url).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not create a link.')
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Sign-in link</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hasAccount
              ? `${memberName}'s way back in if they sign out. It doesn't expire, and only their linked GitHub account can use it.`
              : `${memberName} hasn't signed in yet — this is a one-time join link and expires in 7 days.`}
          </p>
        </div>
      </div>

      {url && (
        <div className="mt-3 flex items-center gap-2">
          <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className="shrink-0">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <Button
        variant={url ? 'ghost' : 'outline'}
        size="sm"
        className="mt-3 gap-1.5"
        disabled={loading}
        onClick={() => void generate()}
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
        {url ? 'Generate a new one' : copied ? 'Copied' : 'Create link'}
      </Button>

      {url && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Generating a new link retires this one. Only the newest link works.
        </p>
      )}
    </div>
  )
}
