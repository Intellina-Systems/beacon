'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function CloseCycleButton({ cycleId }: { cycleId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function close() {
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
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy}>
          <CircleCheck className="mr-1.5 h-3.5 w-3.5" />
          {busy ? 'Closing…' : 'Close cycle'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close this cycle now?</AlertDialogTitle>
          <AlertDialogDescription>Unfinished items will roll into a new cycle.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={close}>Close cycle</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
