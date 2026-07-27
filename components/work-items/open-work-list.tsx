'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/page-shell'
import { STATUS_META } from '@/lib/work-items/constants'
import { WorkItemDetailSheet } from '@/components/work-items/work-item-detail-sheet'
import type { WorkItemStatus } from '@/lib/db/schema'

export interface OpenWorkItemRow {
  id: string
  key: string | null
  title: string
  status: WorkItemStatus
  externalUrl: string | null
}

/**
 * Read-only "open work" list used on engine/team detail pages — clicking a
 * row opens the same WorkItemDetailSheet the main /work board uses, instead
 * of the row being inert.
 */
export function OpenWorkList({
  items,
  roster,
  currentMemberId,
  emptyLabel,
}: {
  items: OpenWorkItemRow[]
  roster: { id: string; name: string }[]
  currentMemberId: string
  emptyLabel: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <>
      <div className="min-h-0 flex-1 divide-y overflow-y-auto px-4">
        {items.length === 0 ? (
          <EmptyState title={emptyLabel} />
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className="-mx-4 flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent/40"
            >
              {item.key && <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>}
              <span className="flex-1 truncate">{item.title}</span>
              <Badge
                variant={item.status === 'blocked' ? 'destructive' : 'outline'}
                className="shrink-0 px-1.5 py-0 font-mono text-[10px]"
              >
                {STATUS_META[item.status].label}
              </Badge>
              {item.externalUrl && (
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Open in tracker"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </button>
          ))
        )}
      </div>

      <WorkItemDetailSheet
        itemId={selectedId}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        roster={roster}
        currentMemberId={currentMemberId}
      />
    </>
  )
}
