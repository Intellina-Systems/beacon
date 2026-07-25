'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { STATUS_META } from '@/lib/work-items/constants'
import { Badge } from '@/components/ui/badge'
import { WorkItemDetailSheet } from './work-item-detail-sheet'
import type { WorkItemRow } from './work-items-table'
import type { WorkItemStatus } from '@/lib/db/schema'

// Triage is a separate queue (see /work?status=triage) and cancelled items
// are noise on a planning board — both are left off the columns.
const BOARD_STATUSES: WorkItemStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done']

interface RosterOption {
  id: string
  name: string
}

export function BoardView({
  rows,
  roster,
  currentMemberId,
}: {
  rows: WorkItemRow[]
  roster: RosterOption[]
  currentMemberId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [localRows, setLocalRows] = useState(rows)
  const [clickedId, setClickedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<WorkItemStatus | null>(null)

  // Deep-link: /work?item=<id> opens that item's detail sheet (derived, no effect).
  const itemParam = searchParams.get('item')
  const selectedId = clickedId ?? itemParam

  // Resync local state when the server-rendered page reloads (same pattern
  // as components/work-items/work-items-table.tsx).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors rows after router.refresh(), not derivable from render
  useEffect(() => setLocalRows(rows), [rows])

  const columns = BOARD_STATUSES.map((status) => ({
    status,
    items: localRows.filter((r) => r.status === status),
  }))

  async function moveTo(itemId: string, targetStatus: WorkItemStatus, overId: string | null) {
    const item = localRows.find((r) => r.id === itemId)
    if (!item) return
    const statusChanged = item.status !== targetStatus

    const destItems = localRows.filter((r) => r.status === targetStatus && r.id !== itemId)
    let moveAfterId: string | null = null
    let moveBeforeId: string | null = null
    if (overId) {
      const idx = destItems.findIndex((r) => r.id === overId)
      if (idx !== -1) {
        moveBeforeId = overId
        moveAfterId = idx > 0 ? destItems[idx - 1].id : null
      }
    } else {
      moveAfterId = destItems.length > 0 ? destItems[destItems.length - 1].id : null
    }

    setLocalRows((prev) => prev.map((r) => (r.id === itemId ? { ...r, status: targetStatus } : r)))

    const res = await fetch(`/api/work-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(statusChanged ? { status: targetStatus } : {}), moveAfterId, moveBeforeId }),
    })
    if (res.ok) {
      router.refresh()
    } else {
      toast.error('Failed to move item')
      setLocalRows(rows)
    }
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverStatus(col.status)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (draggingId) moveTo(draggingId, col.status, null)
              setDraggingId(null)
              setDragOverStatus(null)
            }}
            className={cn(
              'flex w-64 shrink-0 flex-col rounded-lg border bg-card transition-all duration-200',
              dragOverStatus === col.status && 'border-beacon/40 bg-beacon/[0.04] ring-2 ring-beacon/40',
            )}
          >
            <div className="flex items-center gap-1.5 border-b px-3 py-2">
              <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_META[col.status].tone)} />
              <p className="text-xs font-medium">{STATUS_META[col.status].label}</p>
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{col.items.length}</span>
            </div>
            <div className="min-h-16 flex-1 space-y-1.5 p-1.5">
              {col.items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggingId(item.id)}
                  onDragEnd={() => {
                    setDraggingId(null)
                    setDragOverStatus(null)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (draggingId && draggingId !== item.id) moveTo(draggingId, col.status, item.id)
                    setDraggingId(null)
                    setDragOverStatus(null)
                  }}
                  onClick={() => setClickedId(item.id)}
                  className={cn(
                    'ease-out-soft cursor-pointer rounded-md border bg-background p-2 text-xs shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-beacon/40 hover:shadow-md',
                    draggingId === item.id && 'scale-[0.97] opacity-40 shadow-none',
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    {item.key && <span className="font-mono text-[10px] text-muted-foreground">{item.key}</span>}
                    {item.priority != null && item.priority > 0 && item.priority <= 2 && (
                      <Badge variant="destructive" className="px-1 py-0 text-[9px]">
                        !
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 font-medium">{item.title}</p>
                  {item.assigneeName && (
                    <p className="mt-1.5 truncate text-[10px] text-muted-foreground">{item.assigneeName}</p>
                  )}
                </div>
              ))}
              {col.items.length === 0 && (
                <p className="px-1.5 py-3 text-center text-[10px] text-muted-foreground/60">No items</p>
              )}
            </div>
          </div>
        ))}
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
    </>
  )
}
