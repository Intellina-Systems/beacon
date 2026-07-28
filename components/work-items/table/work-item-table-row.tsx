import { memo } from 'react'
import { Ban, Check, Clock, ExternalLink, GripVertical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { RelativeTime } from '@/components/ui/relative-time'
import { EDITABLE_STATUSES, KIND_LABEL, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_META } from '@/lib/work-items/constants'
import type { ProjectOption, RosterOption, WorkItemRow } from '@/lib/work-items/types'
import { QuickEditCell } from './quick-edit-cell'

// workItems.updatedAt is NOT NULL in the schema; this fallback is defensive
// only, so it must stay pure (no Date.now()) rather than reflect real "now".
const UNKNOWN_ACTIVITY_DATE = new Date(0)

function WorkItemTableRowImpl({
  item,
  roster,
  projects,
  isTriageView,
  sorted,
  selected,
  dragging,
  busy,
  onToggleSelected,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onQuickPatch,
  onTriageAction,
  onMarkDuplicate,
}: {
  item: WorkItemRow
  roster: RosterOption[]
  projects: ProjectOption[]
  isTriageView: boolean
  sorted: boolean
  selected: boolean
  dragging: boolean
  busy: boolean
  onToggleSelected: (id: string) => void
  onClick: (id: string) => void
  onDragStart: (id: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, overId: string) => void
  onDragEnd: () => void
  onQuickPatch: (id: string, body: Record<string, unknown>) => void
  onTriageAction: (id: string, body: Record<string, unknown>) => void
  onMarkDuplicate: (id: string) => void
}) {
  return (
    <TableRow
      draggable={!sorted}
      onDragStart={() => !sorted && onDragStart(item.id)}
      onDragOver={(e) => !sorted && onDragOver(e)}
      onDrop={(e) => {
        if (sorted) return
        e.preventDefault()
        onDrop(e, item.id)
      }}
      onDragEnd={onDragEnd}
      onClick={() => onClick(item.id)}
      className={cn('cursor-pointer', dragging && 'opacity-40', selected && 'bg-beacon/[0.04]')}
    >
      <TableCell className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelected(item.id)}
          aria-label={`Select ${item.title}`}
        />
      </TableCell>
      <TableCell
        className={cn(
          'px-2 py-2.5 text-muted-foreground/40',
          sorted ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing',
        )}
        title={sorted ? 'Clear sort to reorder manually' : undefined}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </TableCell>
      <TableCell className="max-w-0 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          {item.key && <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>}
          <span className="truncate font-medium">{item.title}</span>
          {item.kind !== 'task' && (
            <Badge variant="secondary" className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase">
              {KIND_LABEL[item.kind]}
            </Badge>
          )}
          {item.engineName && (
            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
              {item.engineName}
            </Badge>
          )}
          {item.teamName && (
            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
              {item.teamName}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden px-4 py-2.5 lg:table-cell" onClick={(e) => e.stopPropagation()}>
        <QuickEditCell
          trigger={item.projectName ?? '—'}
          disabled={busy}
          triggerClassName="block h-auto max-w-full truncate font-mono text-[11px] font-normal text-muted-foreground hover:bg-accent"
          items={projects.map((p) => ({
            key: p.id,
            label: p.name,
            onSelect: () => onQuickPatch(item.id, { projectId: p.id }),
          }))}
        />
      </TableCell>
      <TableCell className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        {item.status === 'triage' ? (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[item.status].tone)} />
            {STATUS_META[item.status].label}
          </span>
        ) : (
          <QuickEditCell
            trigger={
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[item.status].tone)} />
                {STATUS_META[item.status].label}
              </span>
            }
            disabled={busy}
            triggerClassName="flex h-auto items-center gap-1.5 whitespace-nowrap text-xs font-normal text-muted-foreground hover:bg-accent"
            items={EDITABLE_STATUSES.map((s) => ({
              key: s,
              label: (
                <span className="flex items-center gap-1.5">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[s].tone)} />
                  {STATUS_META[s].label}
                </span>
              ),
              onSelect: () => onQuickPatch(item.id, { status: s }),
            }))}
          />
        )}
      </TableCell>
      <TableCell className="hidden px-4 py-2.5 sm:table-cell" onClick={(e) => e.stopPropagation()}>
        <QuickEditCell
          trigger={PRIORITY_LABEL[item.priority ?? 0]}
          disabled={busy}
          triggerClassName={cn(
            'h-auto text-xs font-normal hover:bg-accent',
            item.priority != null && item.priority > 0 && item.priority <= 2
              ? 'font-medium text-destructive'
              : 'text-muted-foreground',
          )}
          items={PRIORITY_ORDER.map((p) => ({
            key: String(p),
            label: PRIORITY_LABEL[p],
            onSelect: () => onQuickPatch(item.id, { priority: p }),
          }))}
        />
      </TableCell>
      <TableCell className="hidden px-4 py-2.5 md:table-cell" onClick={(e) => e.stopPropagation()}>
        <QuickEditCell
          trigger={item.assigneeName ?? <span className="text-muted-foreground/50">Unassigned</span>}
          disabled={busy}
          triggerClassName="block h-auto max-w-full truncate text-xs font-normal text-muted-foreground hover:bg-accent"
          items={[
            { key: 'none', label: 'Unassigned', onSelect: () => onQuickPatch(item.id, { assigneeMemberId: null }) },
            ...roster.map((m) => ({
              key: m.id,
              label: m.name,
              onSelect: () => onQuickPatch(item.id, { assigneeMemberId: m.id }),
            })),
          ]}
        />
      </TableCell>
      <TableCell className="hidden whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-muted-foreground lg:table-cell">
        <RelativeTime date={item.lastEventAt ?? item.updatedAt ?? UNKNOWN_ACTIVITY_DATE} />
      </TableCell>
      {isTriageView && (
        <TableCell className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={busy}
              onClick={() => onTriageAction(item.id, { action: 'accept' })}
            >
              <Check className="mr-1 h-3 w-3" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={busy}
              onClick={() => onTriageAction(item.id, { action: 'decline' })}
            >
              <Ban className="mr-1 h-3 w-3" />
              Decline
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              disabled={busy}
              title="Snooze 1 day"
              onClick={() =>
                onTriageAction(item.id, {
                  action: 'snooze',
                  until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                })
              }
            >
              <Clock className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px] text-muted-foreground"
              disabled={busy}
              onClick={() => onMarkDuplicate(item.id)}
            >
              Dup
            </Button>
          </div>
        </TableCell>
      )}
      <TableCell className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
        {item.externalUrl && (
          <a
            href={item.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Open in tracker"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </TableCell>
    </TableRow>
  )
}

export const WorkItemTableRow = memo(WorkItemTableRowImpl)
