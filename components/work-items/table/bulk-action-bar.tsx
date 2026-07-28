import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { EDITABLE_STATUSES, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_META } from '@/lib/work-items/constants'
import type { ProjectOption, RosterOption } from '@/lib/work-items/types'

export function BulkActionBar({
  selectedCount,
  roster,
  projects,
  busy,
  onClear,
  onBulkPatch,
  onBulkDelete,
}: {
  selectedCount: number
  roster: RosterOption[]
  projects: ProjectOption[]
  busy: boolean
  onClear: () => void
  onBulkPatch: (body: Record<string, unknown>) => void
  onBulkDelete: () => void
}) {
  return (
    <div
      aria-hidden={selectedCount === 0}
      className={cn(
        'absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 transition-all duration-200 ease-out',
        selectedCount > 0
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-full border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
        <span className="pl-1 text-xs font-medium">{selectedCount} selected</span>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={onClear}>
          Clear
        </Button>
        <span className="mx-1 h-4 w-px shrink-0 bg-border" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy}>
              Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {EDITABLE_STATUSES.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onBulkPatch({ status: s })}>
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[s].tone)} />
                {STATUS_META[s].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy}>
              Priority
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {PRIORITY_ORDER.map((p) => (
              <DropdownMenuItem key={p} onSelect={() => onBulkPatch({ priority: p })}>
                {PRIORITY_LABEL[p]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy}>
              Assignee
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => onBulkPatch({ assigneeMemberId: null })}>Unassigned</DropdownMenuItem>
            {roster.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => onBulkPatch({ assigneeMemberId: m.id })}>
                {m.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {projects.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy}>
                Project
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {projects.map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => onBulkPatch({ projectId: p.id })}>
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span className="mx-1 h-4 w-px shrink-0 bg-border" />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {selectedCount} item{selectedCount > 1 ? 's' : ''}?
              </AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onBulkDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
