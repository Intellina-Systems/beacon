'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { DocTreeNode } from '@/lib/docs/tree'

interface FlatDocOption {
  id: string
  title: string
}

// Flattens the tree into a searchable pick-list, excluding the doc being
// moved (a doc can't be its own parent — the server also guards the fuller
// "under its own descendant" case, this is just the cheap client-side cut).
function flatten(nodes: DocTreeNode[], excludeId: string, out: FlatDocOption[] = []): FlatDocOption[] {
  for (const node of nodes) {
    if (node.id !== excludeId && node.permission === 'edit') {
      out.push({ id: node.id, title: node.title || 'Untitled' })
    }
    flatten(node.children, excludeId, out)
  }
  return out
}

export function MoveDocDialog({
  doc,
  tree,
  open,
  onClose,
  onMoved,
}: {
  doc: DocTreeNode | null
  tree: DocTreeNode[]
  open: boolean
  onClose: () => void
  /** Called after a successful move, in addition to router.refresh() — lets a
   * client-fetched tree (the sidebar) refetch since router.refresh() only
   * re-runs server components. */
  onMoved?: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [moving, setMoving] = useState(false)

  const options = useMemo(() => (doc ? flatten(tree, doc.id) : []), [tree, doc])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return options.filter((o) => !needle || o.title.toLowerCase().includes(needle)).slice(0, 50)
  }, [options, query])

  function handleOpenChange(value: boolean) {
    if (!value) {
      setQuery('')
      onClose()
    }
  }

  async function moveTo(parentId: string | null) {
    if (!doc) return
    setMoving(true)
    try {
      const res = await fetch(`/api/docs/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId }),
      })
      if (res.ok) {
        toast.success(parentId ? 'Moved' : 'Moved to top level')
        router.refresh()
        onMoved?.()
        handleOpenChange(false)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to move document')
      }
    } finally {
      setMoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move &ldquo;{doc?.title || 'Untitled'}&rdquo;</DialogTitle>
        </DialogHeader>
        <Input autoFocus placeholder="Search documents…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="max-h-72 overflow-y-auto rounded-md border">
          <Button
            type="button"
            variant="ghost"
            disabled={moving || !doc?.parentId}
            onClick={() => moveTo(null)}
            className="h-auto w-full justify-start rounded-none border-b px-3 py-2 text-left text-sm font-normal"
          >
            Top level
          </Button>
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No matching documents.</p>
          ) : (
            filtered.map((o) => (
              <Button
                key={o.id}
                type="button"
                variant="ghost"
                disabled={moving}
                onClick={() => moveTo(o.id)}
                className="h-auto w-full justify-start rounded-none px-3 py-2 text-left text-sm font-normal"
              >
                <span className="truncate">{o.title}</span>
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
