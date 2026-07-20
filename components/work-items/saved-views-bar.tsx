'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { ViewFilters, ViewLayout } from '@/lib/db/schema'

export interface SavedView {
  id: string
  name: string
  layout: ViewLayout
  filters: ViewFilters | null
  createdByMemberId: string | null
}

function viewHref(view: SavedView): string {
  const params = new URLSearchParams()
  const f = view.filters ?? {}
  if (f.statuses?.length) params.set('status', f.statuses.join(','))
  if (f.projectId) params.set('project', f.projectId)
  if (f.assignee) params.set('assignee', f.assignee)
  if (view.layout !== 'list') params.set('layout', view.layout)
  const qs = params.toString()
  return qs ? `/work?${qs}` : '/work'
}

export function SavedViewsBar({
  views,
  activeViewId,
  currentFilters,
  currentLayout,
  currentMemberId,
  canDeleteAny,
}: {
  views: SavedView[]
  activeViewId: string | null
  currentFilters: ViewFilters
  currentLayout: ViewLayout
  currentMemberId: string
  canDeleteAny: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function saveView(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), layout: currentLayout, filters: currentFilters }),
      })
      if (res.ok) {
        toast.success('View saved')
        setOpen(false)
        setName('')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to save view')
      }
    } finally {
      setSaving(false)
    }
  }

  async function deleteView(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/views/${id}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
      else toast.error('Failed to delete view')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((view) => {
        const canDelete = canDeleteAny || view.createdByMemberId === currentMemberId
        return (
          <span
            key={view.id}
            className={cn(
              'group flex items-center gap-1 rounded-full border pl-3 pr-1 py-1 font-mono text-xs font-medium transition-colors',
              activeViewId === view.id
                ? 'border-beacon/50 bg-beacon/10 text-foreground'
                : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
            )}
          >
            <Link href={viewHref(view)} className="flex items-center gap-1">
              <Bookmark className="h-3 w-3" />
              {view.name}
            </Link>
            {canDelete && (
              <button
                type="button"
                disabled={busyId === view.id}
                onClick={() => deleteView(view.id)}
                className="rounded-full p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                aria-label={`Delete view ${view.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        )
      })}

      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-3 w-3" />
        Save view
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save current filters as a view</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveView} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My open bugs"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? 'Saving…' : 'Save view'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
