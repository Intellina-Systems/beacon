'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { STATUS_META } from '@/lib/work-items/constants'
import type { WorkItemStatus } from '@/lib/db/schema'

export interface PickableWorkItem {
  id: string
  key: string | null
  title: string
  status: WorkItemStatus
}

/**
 * Search-and-pick dialog over the workspace's work items. Fetches the full
 * list itself on open so any consumer (relation target, duplicate target…)
 * can drop this in without wiring data loading.
 */
export function PickWorkItemDialog({
  open,
  onClose,
  excludeIds = [],
  title = 'Find a work item',
  onPick,
}: {
  open: boolean
  onClose: () => void
  excludeIds?: string[]
  title?: string
  onPick: (item: PickableWorkItem) => void
}) {
  const [items, setItems] = useState<PickableWorkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    // Same fetch-on-open pattern as components/integrations/sources-card.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for an async fetch triggered by `open`, not derivable from render
    setLoading(true)
    fetch('/api/work-items?limit=500')
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => toast.error('Failed to load work items'))
      .finally(() => setLoading(false))
  }, [open])

  // Clear the search box each time the dialog is dismissed, so it reopens fresh.
  function handleOpenChange(value: boolean) {
    if (!value) {
      setQuery('')
      onClose()
    }
  }

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items
      .filter((item) => !excluded.has(item.id))
      .filter(
        (item) => !needle || item.title.toLowerCase().includes(needle) || item.key?.toLowerCase().includes(needle),
      )
      .slice(0, 50)
  }, [items, excluded, query])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Search by title or key…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-72 overflow-y-auto rounded-md border">
          {loading ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No matching work items.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onPick(item)
                    setQuery('')
                    onClose()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[item.status].tone)} />
                  {item.key && <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>}
                  <span className="truncate">{item.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
