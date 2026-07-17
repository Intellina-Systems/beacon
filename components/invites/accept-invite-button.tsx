'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/invites/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? 'Failed to accept invite')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={accept} disabled={busy} className="w-full">
        {busy ? 'Joining…' : 'Accept invite'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
