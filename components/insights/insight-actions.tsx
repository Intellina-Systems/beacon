'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function InsightActions({ insightId }: { insightId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'resolved' | 'dismissed' | null>(null)

  async function setStatus(status: 'resolved' | 'dismissed') {
    setBusy(status)
    try {
      const res = await fetch(`/api/insights/${insightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) router.refresh()
      else toast.error('Failed to update insight')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-success"
        title="Resolve"
        disabled={busy !== null}
        onClick={() => setStatus('resolved')}
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
        title="Dismiss"
        disabled={busy !== null}
        onClick={() => setStatus('dismissed')}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
