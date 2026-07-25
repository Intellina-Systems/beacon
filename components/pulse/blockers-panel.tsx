'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowUpRight, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Panel, PanelHeader } from '@/components/page-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { relativeTime } from '@/lib/utils/relative-time'
import { cn } from '@/lib/utils'

export interface BlockerRow {
  eventId: string
  summary: string
  reason: string | null
  workItemId: string | null
  workItemKey: string | null
  memberId: string | null
  memberName: string | null
  actorLabel: string | null
  occurredAt: string
}

export function BlockersPanel({ blockers, className }: { blockers: BlockerRow[]; className?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [detail, setDetail] = useState<BlockerRow | null>(null)
  const hasBlockers = blockers.length > 0

  async function resolve(b: BlockerRow) {
    setBusy(b.eventId)
    try {
      const res = await fetch('/api/blockers/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workItemId: b.workItemId,
          workItemKey: b.workItemKey,
          memberId: b.memberId,
          memberName: b.memberName,
          actorLabel: b.actorLabel,
        }),
      })
      if (res.ok) {
        toast.success('Blocker resolved')
        setDetail(null)
        router.refresh()
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(data?.error ?? 'Could not resolve')
      }
    } finally {
      setBusy(null)
    }
  }

  function meta(b: BlockerRow) {
    return [b.memberName ?? b.actorLabel, relativeTime(new Date(b.occurredAt))].filter(Boolean).join(' · ')
  }

  return (
    <Panel className={cn(hasBlockers && 'border-destructive/40', className)}>
      <PanelHeader
        label={
          <span className={cn('flex items-center gap-1.5', hasBlockers && 'text-destructive')}>
            <AlertTriangle className="h-3.5 w-3.5" />
            Blockers
          </span>
        }
        meta={
          <Badge variant={hasBlockers ? 'destructive' : 'outline'} className="tabular-nums">
            {blockers.length}
          </Badge>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {!hasBlockers ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">Nobody is blocked.</p>
        ) : (
          <div className="divide-y">
            {blockers.map((b) => {
              const rowContent = (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-snug">{b.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{meta(b)}</p>
                </div>
              )
              return (
                <div key={b.eventId} className="group flex items-center gap-1 py-2">
                  {b.workItemId ? (
                    <Link
                      href={`/work?item=${b.workItemId}`}
                      className="-mx-2 flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-accent/60"
                    >
                      {rowContent}
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  ) : (
                    <button
                      onClick={() => setDetail(b)}
                      className="-mx-2 flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/60"
                    >
                      {rowContent}
                    </button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-success"
                    title="Mark resolved"
                    disabled={busy !== null}
                    onClick={() => resolve(b)}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Blocker
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">{detail.summary}</p>
              {detail.reason && (
                <div>
                  <p className="micro-label mb-1">Reason</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{detail.reason}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{meta(detail)}</p>
              <div className="flex justify-end">
                <Button size="sm" disabled={busy !== null} onClick={() => resolve(detail)}>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Mark resolved
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
