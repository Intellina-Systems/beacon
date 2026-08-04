'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
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

export function DeleteDocButton({ docId }: { docId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch(`/api/docs/${docId}`, { method: 'DELETE' })
      if (res.ok) {
        const { parentId } = (await res.json()) as { parentId: string | null }
        router.push(parentId ? `/docs/${parentId}` : '/docs')
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
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={busy}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this document?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
