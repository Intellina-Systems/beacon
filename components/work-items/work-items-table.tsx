'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Check, Clock, ExternalLink, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/utils/relative-time'
import { KIND_LABEL, PRIORITY_LABEL, STATUS_META } from '@/lib/work-items/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  assigneeName: string | null
  projectName: string | null
  externalUrl: string | null
  lastEventAt: string | Date | null
  updatedAt: string | Date | null
}

interface RosterOption {
  id: string
  name: string
}

export function WorkItemsTable({
  rows,
  roster,
  currentMemberId,
  isTriageView,
}: {
  rows: WorkItemRow[]
  roster: RosterOption[]
  currentMemberId: string
  isTriageView: boolean
}) {
  const router = useRouter()
  const [localRows, setLocalRows] = useState(rows)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [duplicatePickerFor, setDuplicatePickerFor] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => setLocalRows(rows), [rows])

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

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
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
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-accent/40',
                  draggingId === item.id && 'opacity-40',
                )}
              >
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
                  </div>
                </td>
                <td className="hidden px-4 py-2.5 lg:table-cell">
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {item.projectName ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[item.status].tone)} />
                    {STATUS_META[item.status].label}
                  </span>
                </td>
                <td className="hidden px-4 py-2.5 sm:table-cell">
                  {item.priority != null && item.priority > 0 ? (
                    <span
                      className={cn(
                        'text-xs',
                        item.priority <= 2 ? 'font-medium text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {PRIORITY_LABEL[item.priority]}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="hidden truncate px-4 py-2.5 text-xs text-muted-foreground md:table-cell">
                  {item.assigneeName ?? <span className="text-muted-foreground/50">Unassigned</span>}
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
        onClose={() => setSelectedId(null)}
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
    </>
  )
}
