'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, CircleCheck, CircleDashed } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { STATUS_META } from '@/lib/work-items/constants'
import { workItemHref } from '@/lib/work-items/href'
import { cn } from '@/lib/utils'
import type { WorkItemStatus } from '@/lib/db/schema'

interface PlanItem {
  id: string
  key: string | null
  title: string
  status: WorkItemStatus
  touched: boolean
}

interface PlanDetail {
  memberName: string
  intention: string | null
  items: PlanItem[]
}

export function PlanDetailDialog({
  memberId,
  open,
  onOpenChange,
}: {
  memberId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Keyed by memberId at the call site, so this mounts fresh per person and
  // `detail === null` cleanly means "still loading" (no sync setState needed).
  const [detail, setDetail] = useState<PlanDetail | null>(null)

  useEffect(() => {
    if (!open || !memberId) return
    let active = true
    fetch(`/api/plans/${memberId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PlanDetail | null) => {
        if (active) setDetail(data ?? { memberName: '', intention: null, items: [] })
      })
    return () => {
      active = false
    }
  }, [open, memberId])

  const loading = detail === null

  const touchedCount = detail?.items.filter((i) => i.touched).length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {detail ? `${detail.memberName}'s plan today` : 'Plan'}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : !detail || (!detail.intention && detail.items.length === 0) ? (
          <p className="py-2 text-sm text-muted-foreground">No plan set for today.</p>
        ) : (
          <div className="space-y-4">
            {detail.intention && <p className="whitespace-pre-wrap text-sm leading-relaxed">{detail.intention}</p>}

            {detail.items.length > 0 && (
              <div>
                <p className="micro-label mb-2 flex items-center justify-between">
                  <span>Linked work</span>
                  <span className="tabular-nums text-muted-foreground">
                    {touchedCount}/{detail.items.length} touched today
                  </span>
                </p>
                <div className="space-y-1">
                  {detail.items.map((item) => (
                    <Link
                      key={item.id}
                      href={workItemHref(item)}
                      className="group flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-sm transition-colors hover:border-beacon/40 hover:bg-accent/40"
                    >
                      {item.touched ? (
                        <CircleCheck className="h-4 w-4 shrink-0 text-beacon" />
                      ) : (
                        <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                      )}
                      <span
                        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[item.status]?.tone)}
                        aria-hidden
                      />
                      {item.key && <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>}
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[10px]">
                        {STATUS_META[item.status]?.label ?? item.status}
                      </Badge>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
