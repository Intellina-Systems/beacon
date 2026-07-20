'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function DeleteDocButton({ docId }: { docId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function remove() {
    if (!window.confirm('Delete this document? This cannot be undone.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/docs/${docId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/docs')
        router.refresh()
      } else {
        toast.error('Failed to delete document')
        setBusy(false)
      }
    } catch {
      setBusy(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground hover:text-destructive"
      disabled={busy}
      onClick={remove}
    >
      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
      Delete
    </Button>
  )
}
