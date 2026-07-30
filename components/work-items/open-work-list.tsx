import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/page-shell'
import { STATUS_META } from '@/lib/work-items/constants'
import { workItemHref } from '@/lib/work-items/href'
import type { WorkItemStatus } from '@/lib/db/schema'

export interface OpenWorkItemRow {
  id: string
  key: string | null
  title: string
  status: WorkItemStatus
  externalUrl: string | null
}

/**
 * Read-only "open work" list used on engine/team detail pages — each row links
 * through to the item's own page, the same destination the /work board uses.
 */
export function OpenWorkList({ items, emptyLabel }: { items: OpenWorkItemRow[]; emptyLabel: string }) {
  return (
    <div className="min-h-0 flex-1 divide-y overflow-y-auto px-4">
      {items.length === 0 ? (
        <EmptyState title={emptyLabel} />
      ) : (
        items.map((item) => (
          <div key={item.id} className="-mx-4 flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-accent/40">
            {item.key && <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>}
            <Link href={workItemHref(item)} className="flex-1 truncate hover:underline hover:underline-offset-4">
              {item.title}
            </Link>
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
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Open in tracker"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        ))
      )}
    </div>
  )
}
