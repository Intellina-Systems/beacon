'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RelativeTime } from '@/components/ui/relative-time'
import { KIND_LABEL, PRIORITY_LABEL, STATUS_META } from '@/lib/work-items/constants'
import { initialsOf } from '@/lib/work-items/format'
import { workItemHref } from '@/lib/work-items/href'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { BOARD_STATUSES, useBoardColumns } from './board-columns-context'
import type { WorkItemRow } from './work-items-table'
import type { SortKey } from './table/types'
import type { WorkItemStatus } from '@/lib/db/schema'

export function BoardView({ rows, sort }: { rows: WorkItemRow[]; sort: SortKey }) {
  const router = useRouter()
  const [localRows, setLocalRows] = useState(rows)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<WorkItemStatus | null>(null)
  const { hiddenColumns } = useBoardColumns()

  // Resync local state when the server-rendered page reloads (same pattern
  // as components/work-items/work-items-table.tsx).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors rows after router.refresh(), not derivable from render
  useEffect(() => setLocalRows(rows), [rows])

  const columns = BOARD_STATUSES.filter((status) => !hiddenColumns.has(status)).map((status) => ({
    status,
    items: localRows.filter((r) => r.status === status),
  }))

  async function moveTo(itemId: string, targetStatus: WorkItemStatus, overId: string | null) {
    const item = localRows.find((r) => r.id === itemId)
    if (!item) return
    const statusChanged = item.status !== targetStatus

    // Position-within-column only means anything when the board is actually
    // showing manual (rank) order — computing it under a "Newest first" sort
    // would just have the card snap back to its created-date position the
    // moment the refresh below re-fetches.
    let reorder: { moveAfterId: string | null; moveBeforeId: string | null } | undefined
    if (sort === 'manual') {
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
      reorder = { moveAfterId, moveBeforeId }
    }

    // Dropped back into the same column, not in manual mode — there's
    // nothing to persist, so skip the request rather than send an empty
    // patch the API would reject.
    if (!statusChanged && !reorder) return

    setLocalRows((prev) => prev.map((r) => (r.id === itemId ? { ...r, status: targetStatus } : r)))

    const res = await fetch(`/api/work-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(statusChanged ? { status: targetStatus } : {}), ...reorder }),
    })
    if (res.ok) {
      router.refresh()
    } else {
      toast.error('Failed to move item')
      setLocalRows(rows)
    }
  }

  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-2">
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
            'flex h-full min-w-80 flex-1 flex-col rounded-xl border bg-muted/30 transition-colors duration-200',
            dragOverStatus === col.status && 'border-beacon/40 bg-beacon/[0.06] ring-2 ring-beacon/40',
          )}
        >
          <div className="flex shrink-0 items-center gap-2 border-b px-3.5 py-3">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_META[col.status].tone)} />
            <p className="text-sm font-semibold">{STATUS_META[col.status].label}</p>
            <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {col.items.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
            {col.items.map((item) => {
              const activityDate = new Date(item.lastEventAt ?? item.updatedAt ?? Date.now())
              return (
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
                  // Card-wide click target; the title inside is a real anchor
                  // so a card can be opened in a new tab.
                  onClick={() => router.push(workItemHref(item))}
                  className={cn(
                    'ease-out-soft cursor-pointer rounded-lg border bg-card p-3 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-beacon/40 hover:shadow-md',
                    draggingId === item.id && 'scale-[0.97] opacity-40 shadow-none',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {item.key && <span className="font-mono text-[10.5px] text-muted-foreground">{item.key}</span>}
                    {item.kind !== 'task' && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[9px] uppercase">
                        {KIND_LABEL[item.kind]}
                      </Badge>
                    )}
                    {item.priority != null && item.priority > 0 && item.priority <= 2 && (
                      <Badge variant="destructive" className="ml-auto px-1.5 py-0 text-[9px]">
                        {PRIORITY_LABEL[item.priority]}
                      </Badge>
                    )}
                  </div>

                  <Link
                    href={workItemHref(item)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 line-clamp-2 block text-[13px] font-medium leading-snug"
                  >
                    {item.title}
                  </Link>

                  {(item.projectName || item.engineName || item.teamName) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.projectName && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[9.5px] text-muted-foreground">
                          {item.projectName}
                        </Badge>
                      )}
                      {item.engineName && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[9.5px] text-muted-foreground">
                          {item.engineName}
                        </Badge>
                      )}
                      {item.teamName && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[9.5px] text-muted-foreground">
                          {item.teamName}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Avatar className="h-5 w-5 border">
                        <AvatarFallback className="text-[8px] font-medium">
                          {initialsOf(item.assigneeName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-[10.5px] text-muted-foreground">
                        {item.assigneeName ?? 'Unassigned'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground/70">
                      <Clock className="h-2.5 w-2.5" />
                      <RelativeTime date={activityDate} />
                    </span>
                  </div>
                </div>
              )
            })}
            {col.items.length === 0 && (
              <p className="px-1.5 py-3 text-center text-[10px] text-muted-foreground/60">No items</p>
            )}
          </div>
        </div>
      ))}
      {columns.length === 0 && (
        <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">
          All columns are hidden — use Columns above to bring one back.
        </p>
      )}
    </div>
  )
}
