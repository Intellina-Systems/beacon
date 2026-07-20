'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckCheck, Clock, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/page-shell'
import { WorkItemDetailSheet } from '@/components/work-items/work-item-detail-sheet'
import { relativeTime } from '@/lib/utils/relative-time'
import { cn } from '@/lib/utils'

interface NotificationRow {
  id: string
  readAt: string | Date | null
  snoozedUntil: string | Date | null
  createdAt: string | Date
  eventType: string
  eventSource: string
  eventSummary: string
  actorLabel: string | null
  occurredAt: string | Date
  workItemId: string | null
  workItemKey: string | null
  workItemTitle: string | null
}

interface RosterOption {
  id: string
  name: string
}

const SNOOZE_PRESETS = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '1 day', ms: 24 * 60 * 60 * 1000 },
  { label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 },
]

export function InboxList({
  initialRows,
  roster,
  currentMemberId,
}: {
  initialRows: NotificationRow[]
  roster: RosterOption[]
  currentMemberId: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(null)

  // Resync local state when the server-rendered page reloads (same pattern
  // as components/work-items/work-items-table.tsx).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors initialRows after router.refresh(), not derivable from render
  useEffect(() => setRows(initialRows), [initialRows])

  async function setRead(id: string, read: boolean) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, readAt: read ? new Date().toISOString() : null } : r)))
    const res = await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read }),
    })
    if (!res.ok) {
      toast.error('Failed to update notification')
      router.refresh()
    }
  }

  async function snooze(id: string, until: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, snoozedUntil: until } : r)))
    const res = await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snoozedUntil: until }),
    })
    if (res.ok) {
      router.refresh()
    } else {
      toast.error('Failed to snooze notification')
    }
  }

  async function markAllRead() {
    const res = await fetch('/api/notifications/mark-all-read', { method: 'POST' })
    if (res.ok) {
      setRows((prev) => prev.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })))
      router.refresh()
    } else {
      toast.error('Failed to mark all as read')
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex rounded-lg border border-dashed">
        <EmptyState title="Inbox zero" hint="Events on work items you watch will show up here." />
      </div>
    )
  }

  return (
    <>
      <div className="mb-2 flex justify-end">
        <Button size="sm" variant="outline" onClick={markAllRead}>
          <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
          Mark all read
        </Button>
      </div>

      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        {rows.map((row) => {
          const unread = !row.readAt
          return (
            <div
              key={row.id}
              onClick={() => row.workItemId && setSelectedWorkItemId(row.workItemId)}
              className={cn(
                'flex items-start gap-3 px-4 py-3 transition-colors',
                row.workItemId && 'cursor-pointer hover:bg-accent/40',
                unread && 'bg-beacon/5',
              )}
            >
              <span
                className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', unread ? 'bg-beacon' : 'bg-transparent')}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {row.workItemKey && <span className="font-mono">{row.workItemKey}</span>}
                  <span className="uppercase tracking-wide">{row.eventSource}</span>
                  <span>·</span>
                  <span>{relativeTime(new Date(row.occurredAt))}</span>
                </div>
                <p className={cn('mt-0.5 truncate text-sm', unread ? 'font-medium' : 'text-muted-foreground')}>
                  {row.eventSummary}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title={unread ? 'Mark read' : 'Mark unread'}
                  onClick={() => setRead(row.id, unread)}
                >
                  <Check className={cn('h-3.5 w-3.5', !unread && 'text-beacon')} />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {SNOOZE_PRESETS.map((preset) => (
                      <DropdownMenuItem
                        key={preset.label}
                        onClick={() => snooze(row.id, new Date(Date.now() + preset.ms).toISOString())}
                      >
                        <Clock className="mr-2 h-3.5 w-3.5" />
                        Snooze {preset.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )
        })}
      </div>

      <WorkItemDetailSheet
        itemId={selectedWorkItemId}
        open={selectedWorkItemId !== null}
        onClose={() => setSelectedWorkItemId(null)}
        roster={roster}
        currentMemberId={currentMemberId}
      />
    </>
  )
}
