'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Table, TableBody, TableHeader, TableRow, TableHead } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { BulkActionBar } from './table/bulk-action-bar'
import { SortHead } from './table/sort-head'
import { WorkItemTableRow } from './table/work-item-table-row'
import type { SortKey } from './table/types'
import { WorkItemDetailSheet } from './work-item-detail-sheet'
import { PickWorkItemDialog, type PickableWorkItem } from './pick-work-item-dialog'
import type { ProjectOption, RosterOption, WorkItemRow } from '@/lib/work-items/types'

export type { WorkItemRow } from '@/lib/work-items/types'

async function patchItem(id: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/work-items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

export function WorkItemsTable({
  rows,
  roster,
  projects,
  currentMemberId,
  isTriageView,
  sort,
  dir,
}: {
  rows: WorkItemRow[]
  roster: RosterOption[]
  projects: ProjectOption[]
  currentMemberId: string
  isTriageView: boolean
  sort?: SortKey
  dir?: 'asc' | 'desc'
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [localRows, setLocalRows] = useState(rows)
  const [clickedId, setClickedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [duplicatePickerFor, setDuplicatePickerFor] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    setLocalRows(rows)
    setSelected(new Set())
  }, [rows])

  // Deep-link: /work?item=<id> opens that item's detail sheet (used by Pulse
  // plans/blockers/events links). Derived from the URL so no effect/setState is
  // needed; a local click takes precedence over the param.
  const itemParam = searchParams.get('item')
  const selectedId = clickedId ?? itemParam

  async function moveTo(draggedId: string, overId: string) {
    const order = localRows.map((r) => r.id).filter((id) => id !== draggedId)
    const overIdx = order.indexOf(overId)
    if (overIdx === -1) return
    order.splice(overIdx, 0, draggedId)

    const idx = order.indexOf(draggedId)
    const moveAfterId = idx > 0 ? order[idx - 1] : null
    const moveBeforeId = idx < order.length - 1 ? order[idx + 1] : null

    const byId = new Map(localRows.map((r) => [r.id, r]))
    setLocalRows(order.map((id) => byId.get(id)!).filter(Boolean))

    const res = await fetch(`/api/work-items/${draggedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moveAfterId, moveBeforeId }),
    })
    if (res.ok) {
      router.refresh()
    } else {
      toast.error('Failed to reorder')
      setLocalRows(rows)
    }
  }

  async function triageAction(id: string, body: Record<string, unknown>) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/work-items/${id}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Triage action failed')
      }
    } finally {
      setBusyId(null)
    }
  }

  async function markDuplicate(id: string, canonicalId: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/work-items/${id}/relations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relatedItemId: canonicalId, type: 'duplicate' }),
      })
      if (res.ok) {
        toast.success('Marked as duplicate')
        router.refresh()
      } else {
        toast.error('Failed to mark duplicate')
      }
    } finally {
      setBusyId(null)
    }
  }

  // Single-field quick edits from the row itself (status/priority/assignee/project
  // pills) — same PATCH endpoint the detail sheet uses, just without opening it.
  async function quickPatch(id: string, body: Record<string, unknown>) {
    setBusyId(id)
    try {
      const ok = await patchItem(id, body)
      if (ok) {
        router.refresh()
      } else {
        toast.error('Failed to update work item')
      }
    } finally {
      setBusyId(null)
    }
  }

  // Clicking a sorted column cycles asc -> desc -> back to the default manual (rank) order.
  function toggleSort(key: SortKey) {
    const params = new URLSearchParams(searchParams.toString())
    if (sort === key && dir === 'asc') {
      params.set('sort', key)
      params.set('dir', 'desc')
    } else if (sort === key && dir === 'desc') {
      params.delete('sort')
      params.delete('dir')
    } else {
      params.set('sort', key)
      params.set('dir', 'asc')
    }
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `/work?${qs}` : '/work')
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === localRows.length ? new Set() : new Set(localRows.map((r) => r.id))))
  }

  async function bulkPatch(body: Record<string, unknown>) {
    const ids = [...selected]
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      const results = await Promise.all(ids.map((id) => patchItem(id, body)))
      const failed = results.filter((ok) => !ok).length
      if (failed > 0) toast.error(`Failed to update ${failed} of ${ids.length} items`)
      router.refresh()
      setSelected(new Set())
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDelete() {
    const ids = [...selected]
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      const results = await Promise.all(ids.map((id) => fetch(`/api/work-items/${id}`, { method: 'DELETE' })))
      const failed = results.filter((r) => !r.ok).length
      if (failed > 0) toast.error(`Failed to delete ${failed} of ${ids.length} items`)
      else toast.success(`Deleted ${ids.length} item${ids.length > 1 ? 's' : ''}`)
      router.refresh()
      setSelected(new Set())
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <BulkActionBar
        selectedCount={selected.size}
        roster={roster}
        projects={projects}
        busy={bulkBusy}
        onClear={() => setSelected(new Set())}
        onBulkPatch={bulkPatch}
        onBulkDelete={bulkDelete}
      />

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card shadow-xs">
        <Table className="min-w-[680px]">
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted/40">
            <TableRow>
              <TableHead className="w-8 px-2 py-2.5">
                <Checkbox
                  checked={
                    localRows.length > 0 && selected.size === localRows.length
                      ? true
                      : selected.size > 0
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={() => toggleSelectAll()}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-6 px-2 py-2.5" />
              <SortHead
                sortKey="title"
                sort={sort}
                dir={dir}
                onToggle={toggleSort}
                className="micro-label px-4 py-2.5 font-medium"
              >
                Item
              </SortHead>
              <SortHead
                sortKey="project"
                sort={sort}
                dir={dir}
                onToggle={toggleSort}
                className="micro-label hidden w-32 px-4 py-2.5 font-medium lg:table-cell"
              >
                Project
              </SortHead>
              <SortHead
                sortKey="status"
                sort={sort}
                dir={dir}
                onToggle={toggleSort}
                className="micro-label w-32 px-4 py-2.5 font-medium"
              >
                Status
              </SortHead>
              <SortHead
                sortKey="priority"
                sort={sort}
                dir={dir}
                onToggle={toggleSort}
                className="micro-label hidden w-24 px-4 py-2.5 font-medium sm:table-cell"
              >
                Priority
              </SortHead>
              <SortHead
                sortKey="assignee"
                sort={sort}
                dir={dir}
                onToggle={toggleSort}
                className="micro-label hidden w-40 px-4 py-2.5 font-medium md:table-cell"
              >
                Assignee
              </SortHead>
              <SortHead
                sortKey="activity"
                sort={sort}
                dir={dir}
                onToggle={toggleSort}
                align="end"
                className="micro-label hidden w-32 px-4 py-2.5 text-right font-medium lg:table-cell"
              >
                Activity
              </SortHead>
              {isTriageView && <TableHead className="w-56 px-3 py-2.5" />}
              <TableHead className="w-10 px-2 py-2.5" />
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y">
            {localRows.map((item) => (
              <WorkItemTableRow
                key={item.id}
                item={item}
                roster={roster}
                projects={projects}
                isTriageView={isTriageView}
                sorted={!!sort}
                selected={selected.has(item.id)}
                dragging={draggingId === item.id}
                busy={busyId === item.id}
                onToggleSelected={toggleSelected}
                onClick={setClickedId}
                onDragStart={setDraggingId}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(_e, overId) => {
                  if (draggingId && draggingId !== overId) moveTo(draggingId, overId)
                  setDraggingId(null)
                }}
                onDragEnd={() => setDraggingId(null)}
                onQuickPatch={quickPatch}
                onTriageAction={triageAction}
                onMarkDuplicate={setDuplicatePickerFor}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <WorkItemDetailSheet
        itemId={selectedId}
        open={selectedId !== null}
        onClose={() => {
          setClickedId(null)
          if (itemParam) router.replace('/work', { scroll: false })
        }}
        roster={roster}
        currentMemberId={currentMemberId}
      />

      <PickWorkItemDialog
        open={duplicatePickerFor !== null}
        onClose={() => setDuplicatePickerFor(null)}
        excludeIds={duplicatePickerFor ? [duplicatePickerFor] : []}
        title="Mark as a duplicate of…"
        onPick={(picked: PickableWorkItem) => {
          if (duplicatePickerFor) markDuplicate(duplicatePickerFor, picked.id)
        }}
      />
    </div>
  )
}
