import type { WorkItemKind, WorkItemStatus } from '@/lib/db/schema'

export const STATUS_META: Record<WorkItemStatus, { label: string; tone: string }> = {
  triage: { label: 'Triage', tone: 'bg-chart-5' },
  backlog: { label: 'Backlog', tone: 'bg-muted-foreground/35' },
  todo: { label: 'Todo', tone: 'bg-muted-foreground/60' },
  in_progress: { label: 'In progress', tone: 'bg-chart-2' },
  in_review: { label: 'In review', tone: 'bg-chart-3' },
  blocked: { label: 'Blocked', tone: 'bg-destructive' },
  done: { label: 'Done', tone: 'bg-success' },
  cancelled: { label: 'Cancelled', tone: 'bg-muted-foreground/35' },
}

export const STATUS_TAB_ORDER: WorkItemStatus[] = [
  'triage',
  'blocked',
  'in_progress',
  'in_review',
  'todo',
  'backlog',
  'done',
  'cancelled',
]

// Statuses selectable from an existing item's detail view. Triage is
// entry-only — reached via creation or a connector, left via triage actions
// (accept/decline), never re-entered from the status dropdown.
export const EDITABLE_STATUSES: WorkItemStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
]

// Grouping presets for the /work filter bar. "Open" = everything not yet
// resolved (mirrors GitHub's open/closed split); "Completed" = done only
// (cancelled items are excluded — they didn't complete, they were dropped).
export const OPEN_STATUSES: WorkItemStatus[] = ['triage', 'backlog', 'todo', 'in_progress', 'in_review', 'blocked']
export const COMPLETED_STATUSES: WorkItemStatus[] = ['done']

export const PRIORITY_LABEL: Record<number, string> = { 0: 'None', 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' }
export const PRIORITY_ORDER = [0, 1, 2, 3, 4]

export const KIND_LABEL: Record<WorkItemKind, string> = { epic: 'Epic', feature: 'Feature', task: 'Task' }
export const KIND_ORDER: WorkItemKind[] = ['epic', 'feature', 'task']
