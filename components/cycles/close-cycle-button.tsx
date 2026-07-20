'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function CloseCycleButton({ cycleId }: { cycleId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function close() {
    if (!window.confirm('Close this cycle now? Unfinished items will roll into a new cycle.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/cycles/${cycleId}/close`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.rolledOver > 0 ? `Cycle closed — ${data.rolledOver} item(s) rolled forward` : 'Cycle closed')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to close cycle')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={close}>
      <CircleCheck className="mr-1.5 h-3.5 w-3.5" />
      {busy ? 'Closing…' : 'Close cycle'}
    </Button>
  )
}
