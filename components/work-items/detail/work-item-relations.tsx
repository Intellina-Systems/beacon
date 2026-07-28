import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { STATUS_META } from '@/lib/work-items/constants'
import type { RelationEntry, RelationsView } from '@/lib/work-items/types'
import type { WorkItemRelationType } from '@/lib/db/schema'

function RelationGroup({
  label,
  entries,
  onRemove,
}: {
  label: string
  entries: RelationEntry[]
  onRemove: (relationId: string) => void
}) {
  if (entries.length === 0) return null
  return (
    <div>
      <p className="mb-1 text-muted-foreground">{label}</p>
      <div className="space-y-1">
        {entries.map((entry) => (
          <div
            key={entry.relationId}
            className="flex items-center justify-between gap-2 rounded border bg-card px-2 py-1"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[entry.item.status].tone)} />
              {entry.item.key && <span className="shrink-0 font-mono text-muted-foreground">{entry.item.key}</span>}
              <span className="truncate">{entry.item.title}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => onRemove(entry.relationId)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function WorkItemRelations({
  relations,
  onPick,
  onRemove,
}: {
  relations: RelationsView | null
  onPick: (type: WorkItemRelationType | 'duplicate-triage') => void
  onRemove: (relationId: string) => void
}) {
  const isEmpty =
    relations &&
    relations.blocks.length === 0 &&
    relations.blockedBy.length === 0 &&
    !relations.duplicateOf &&
    relations.duplicates.length === 0 &&
    relations.related.length === 0

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="micro-label">Relations</Label>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => onPick('blocks')}>
            + Blocks
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => onPick('related')}>
            + Related
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => onPick('duplicate')}>
            + Duplicate
          </Button>
        </div>
      </div>
      {relations && (
        <div className="space-y-2 text-xs">
          <RelationGroup label="Blocks" entries={relations.blocks} onRemove={onRemove} />
          <RelationGroup label="Blocked by" entries={relations.blockedBy} onRemove={onRemove} />
          {relations.duplicateOf && (
            <RelationGroup label="Duplicate of" entries={[relations.duplicateOf]} onRemove={onRemove} />
          )}
          <RelationGroup label="Duplicates" entries={relations.duplicates} onRemove={onRemove} />
          <RelationGroup label="Related" entries={relations.related} onRemove={onRemove} />
          {isEmpty && <p className="text-muted-foreground">No relations yet.</p>}
        </div>
      )}
    </section>
  )
}
