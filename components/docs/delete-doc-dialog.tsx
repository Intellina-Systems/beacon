'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { DocTreeNode } from '@/lib/docs/tree'

export function DeleteDocDialog({
  doc,
  open,
  onClose,
  onDeleted,
}: {
  doc: DocTreeNode | null
  open: boolean
  onClose: () => void
  /** Called after a successful delete, in addition to router.refresh() — lets
   * the client-fetched sidebar tree refetch since router.refresh() only
   * re-runs server components. */
  onDeleted?: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState(false)

  async function remove() {
    if (!doc) return
    setBusy(true)
    try {
      const res = await fetch(`/api/docs/${doc.id}`, { method: 'DELETE' })
      if (res.ok) {
        const { parentId } = (await res.json()) as { parentId: string | null }
        onDeleted?.()
        // Only navigate away if the doc being deleted is the one currently
        // open — deleting a sibling from the sidebar shouldn't yank the
        // viewer off whatever page they were actually reading.
        if (pathname === `/docs/${doc.id}`) {
          router.push(parentId ? `/docs/${parentId}` : '/docs')
        }
        router.refresh()
        onClose()
      } else {
        toast.error('Failed to delete document')
      }
    } finally {
      setBusy(false)
    }
  }

  const childCount = doc?.children.length ?? 0

  return (
    <AlertDialog open={open} onOpenChange={(value) => !value && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{doc?.title || 'Untitled'}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            {childCount > 0
              ? `This will also delete ${childCount} sub-page${childCount === 1 ? '' : 's'}. This cannot be undone.`
              : 'This cannot be undone.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={remove} disabled={busy}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
