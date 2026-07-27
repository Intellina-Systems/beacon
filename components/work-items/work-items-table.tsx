'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Ban, Check, Clock, ExternalLink, GripVertical, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/utils/relative-time'
import { EDITABLE_STATUSES, KIND_LABEL, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_META } from '@/lib/work-items/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WorkItemDetailSheet } from './work-item-detail-sheet'
import { PickWorkItemDialog, type PickableWorkItem } from './pick-work-item-dialog'
import type { WorkItemStatus } from '@/lib/db/schema'

export interface WorkItemRow {
  id: string
  kind: 'epic' | 'feature' | 'task'
  key: string | null
  title: string
  status: WorkItemStatus
  priority: number | null
  projectId: string
  assigneeMemberId?: string | null
  assigneeName: string | null
  projectName: string | null
  engineName?: string | null
  teamName?: string | null
  externalUrl: string | null
  lastEventAt: string | Date | null
  updatedAt: string | Date | null
}

interface RosterOption {
  id: string
  name: string
}

interface ProjectOption {
  id: string
  name: string
}

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
}: {
  rows: WorkItemRow[]
  roster: RosterOption[]
  projects: ProjectOption[]
  currentMemberId: string
  isTriageView: boolean
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
    if (!window.confirm(`Delete ${ids.length} item${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return
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

  const quickEditTriggerClass =
    '-mx-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50'

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        aria-hidden={selected.size === 0}
        className={cn(
          'absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 transition-all duration-200 ease-out',
          selected.size > 0
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-2 opacity-0',
        )}
      >
        <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-full border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
          <span className="pl-1 text-xs font-medium">{selected.size} selected</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={bulkBusy}>
                Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {EDITABLE_STATUSES.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => bulkPatch({ status: s })}>
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[s].tone)} />
                  {STATUS_META[s].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={bulkBusy}>
                Priority
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PRIORITY_ORDER.map((p) => (
                <DropdownMenuItem key={p} onSelect={() => bulkPatch({ priority: p })}>
                  {PRIORITY_LABEL[p]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={bulkBusy}>
                Assignee
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => bulkPatch({ assigneeMemberId: null })}>Unassigned</DropdownMenuItem>
              {roster.map((m) => (
                <DropdownMenuItem key={m.id} onSelect={() => bulkPatch({ assigneeMemberId: m.id })}>
                  {m.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {projects.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={bulkBusy}>
                  Project
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {projects.map((p) => (
                  <DropdownMenuItem key={p.id} onSelect={() => bulkPatch({ projectId: p.id })}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={bulkBusy}
            onClick={bulkDelete}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card shadow-xs">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:bg-muted/40">
            <tr>
              <th className="w-8 px-2 py-2.5">
                <Checkbox
                  checked={localRows.length > 0 && selected.size === localRows.length ? true : selected.size > 0 ? 'indeterminate' : false}
                  onCheckedChange={() => toggleSelectAll()}
                  aria-label="Select all"
                />
              </th>
              <th className="w-6 px-2 py-2.5" />
              <th className="micro-label px-4 py-2.5 text-left font-medium">Item</th>
              <th className="micro-label hidden w-32 px-4 py-2.5 text-left font-medium lg:table-cell">Project</th>
              <th className="micro-label w-32 px-4 py-2.5 text-left font-medium">Status</th>
              <th className="micro-label hidden w-24 px-4 py-2.5 text-left font-medium sm:table-cell">Priority</th>
              <th className="micro-label hidden w-40 px-4 py-2.5 text-left font-medium md:table-cell">Assignee</th>
              <th className="micro-label hidden w-32 px-4 py-2.5 text-right font-medium lg:table-cell">Activity</th>
              {isTriageView && <th className="w-56 px-3 py-2.5" />}
              <th className="w-10 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {localRows.map((item) => (
              <tr
                key={item.id}
                draggable
                onDragStart={() => setDraggingId(item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (draggingId && draggingId !== item.id) moveTo(draggingId, item.id)
                  setDraggingId(null)
                }}
                onDragEnd={() => setDraggingId(null)}
                onClick={() => setClickedId(item.id)}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-accent/40',
                  draggingId === item.id && 'opacity-40',
                  selected.has(item.id) && 'bg-beacon/[0.04]',
                )}
              >
                <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(item.id)}
                    onCheckedChange={() => toggleSelected(item.id)}
                    aria-label={`Select ${item.title}`}
                  />
                </td>
                <td className="cursor-grab px-2 py-2.5 text-muted-foreground/40 active:cursor-grabbing">
                  <GripVertical className="h-3.5 w-3.5" />
                </td>
                <td className="max-w-0 px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {item.key && <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>}
                    <span className="truncate font-medium">{item.title}</span>
                    {item.kind !== 'task' && (
                      <Badge variant="secondary" className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase">
                        {KIND_LABEL[item.kind]}
                      </Badge>
                    )}
                    {item.engineName && (
                      <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
                        {item.engineName}
                      </Badge>
                    )}
                    {item.teamName && (
                      <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
                        {item.teamName}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="hidden px-4 py-2.5 lg:table-cell" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        disabled={busyId === item.id}
                        className={cn('block max-w-full truncate font-mono text-[11px] text-muted-foreground', quickEditTriggerClass)}
                      >
                        {item.projectName ?? '—'}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {projects.map((p) => (
                        <DropdownMenuItem key={p.id} onSelect={() => quickPatch(item.id, { projectId: p.id })}>
                          {p.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  {item.status === 'triage' ? (
                    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[item.status].tone)} />
                      {STATUS_META[item.status].label}
                    </span>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          disabled={busyId === item.id}
                          className={cn('flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground', quickEditTriggerClass)}
                        >
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[item.status].tone)} />
                          {STATUS_META[item.status].label}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {EDITABLE_STATUSES.map((s) => (
                          <DropdownMenuItem key={s} onSelect={() => quickPatch(item.id, { status: s })}>
                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[s].tone)} />
                            {STATUS_META[s].label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
                <td className="hidden px-4 py-2.5 sm:table-cell" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        disabled={busyId === item.id}
                        className={cn(
                          'text-xs',
                          item.priority != null && item.priority > 0 && item.priority <= 2
                            ? 'font-medium text-destructive'
                            : 'text-muted-foreground',
                          quickEditTriggerClass,
                        )}
                      >
                        {PRIORITY_LABEL[item.priority ?? 0]}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {PRIORITY_ORDER.map((p) => (
                        <DropdownMenuItem key={p} onSelect={() => quickPatch(item.id, { priority: p })}>
                          {PRIORITY_LABEL[p]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
                <td className="hidden px-4 py-2.5 md:table-cell" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        disabled={busyId === item.id}
                        className={cn('block max-w-full truncate text-xs text-muted-foreground', quickEditTriggerClass)}
                      >
                        {item.assigneeName ?? <span className="text-muted-foreground/50">Unassigned</span>}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => quickPatch(item.id, { assigneeMemberId: null })}>
                        Unassigned
                      </DropdownMenuItem>
                      {roster.map((m) => (
                        <DropdownMenuItem key={m.id} onSelect={() => quickPatch(item.id, { assigneeMemberId: m.id })}>
                          {m.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
                <td className="hidden whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-muted-foreground lg:table-cell">
                  {relativeTime(new Date(item.lastEventAt ?? item.updatedAt ?? Date.now()))}
                </td>
                {isTriageView && (
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        disabled={busyId === item.id}
                        onClick={() => triageAction(item.id, { action: 'accept' })}
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        disabled={busyId === item.id}
                        onClick={() => triageAction(item.id, { action: 'decline' })}
                      >
                        <Ban className="mr-1 h-3 w-3" />
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        disabled={busyId === item.id}
                        title="Snooze 1 day"
                        onClick={() =>
                          triageAction(item.id, {
                            action: 'snooze',
                            until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                          })
                        }
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[11px] text-muted-foreground"
                        disabled={busyId === item.id}
                        onClick={() => setDuplicatePickerFor(item.id)}
                      >
                        Dup
                      </Button>
                    </div>
                  </td>
                )}
                <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                  {item.externalUrl && (
                    <a
                      href={item.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Open in tracker"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
