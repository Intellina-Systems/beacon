'use client'

import { useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { Panel, PanelHeader, EmptyState } from '@/components/page-shell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PlanDetailDialog } from './plan-detail-dialog'

export interface PlanRow {
  memberId: string
  memberName: string
  planned: boolean
  intention: string | null
  plannedCount: number
  touchedCount: number
}

export function TodaysPlansPanel({ plans, className }: { plans: PlanRow[]; className?: string }) {
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)
  const plannedCount = plans.filter((p) => p.planned).length

  return (
    <Panel className={className}>
      <PanelHeader
        label="Today's plans"
        meta={
          <span className="tabular-nums">
            {plannedCount}/{plans.length} planned
          </span>
        }
      />
      <div className="min-h-0 flex-1 divide-y overflow-y-auto px-2">
        {plans.length === 0 ? (
          <EmptyState title="No one to show" hint="Plans people set for the day appear here." />
        ) : (
          plans.map((p) => (
            <Button
              key={p.memberId}
              variant="ghost"
              onClick={() => setOpenMemberId(p.memberId)}
              className="h-auto w-full items-start justify-start gap-2.5 rounded-md px-2 py-2.5 text-left font-normal"
            >
              {p.planned ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-beacon" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{p.memberName}</span>
                  {p.plannedCount > 0 && (
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {p.touchedCount}/{p.plannedCount} touched
                    </span>
                  )}
                </div>
                <p
                  className={cn('truncate text-xs', p.intention ? 'text-muted-foreground' : 'text-muted-foreground/50')}
                >
                  {p.intention ?? 'No plan yet'}
                </p>
              </div>
            </Button>
          ))
        )}
      </div>

      <PlanDetailDialog
        key={openMemberId ?? 'none'}
        memberId={openMemberId}
        open={openMemberId !== null}
        onOpenChange={(o) => !o && setOpenMemberId(null)}
      />
    </Panel>
  )
}
