'use client'

import { useState } from 'react'
import { CalendarClock, CircleCheck, CircleDashed } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlanDetailDialog } from './plan-detail-dialog'

export interface PlanHistoryRowData {
  id: string
  memberId: string
  memberName: string
  date: string
  intention: string
  status: 'pending' | 'done'
}

// Flat reverse-chronological list, same shape as McpGrantsAdminTable —
// member + a status badge per row, click through for the full detail (linked
// items, touched/planned) via the existing drill-in dialog.
export function PlansHistoryTable({ rows }: { rows: PlanHistoryRowData[] }) {
  const [open, setOpen] = useState<{ memberId: string; date: string } | null>(null)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" />
          Plan history
        </CardTitle>
        <CardDescription>Every daily plan across the workspace, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No plans filed yet.</p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setOpen({ memberId: row.memberId, date: row.date })}
                className="flex w-full items-start gap-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/40"
              >
                {row.status === 'done' ? (
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-beacon" />
                ) : (
                  <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{row.memberName}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.date}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{row.intention}</p>
                </div>
                <Badge variant={row.status === 'done' ? 'outline' : 'secondary'} className="shrink-0 px-1.5 py-0 text-[10px]">
                  {row.status === 'done' ? 'Done' : 'Pending'}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <PlanDetailDialog
        key={open ? `${open.memberId}:${open.date}` : 'none'}
        memberId={open?.memberId ?? null}
        date={open?.date}
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
      />
    </Card>
  )
}
