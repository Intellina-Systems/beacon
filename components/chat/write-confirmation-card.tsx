import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function summarize(toolName: string, input: unknown): { title: string; lines: string[] } {
  const i = (input ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)

  switch (toolName) {
    case 'create_work_item':
      return {
        title: `Create ${str(i.kind) ?? 'task'}: "${str(i.title) ?? ''}"`,
        lines: [
          str(i.description),
          i.projectId ? `Project: ${i.projectId}` : undefined,
          i.assigneeMemberId ? `Assignee: ${i.assigneeMemberId}` : 'Unassigned',
        ].filter((v): v is string => Boolean(v)),
      }
    case 'update_work_item':
      return {
        title: `Update ${str(i.idOrKey) ?? 'work item'}`,
        lines: Object.entries(i)
          .filter(([key]) => key !== 'idOrKey')
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
      }
    case 'add_relation':
      return { title: `${str(i.idOrKey)} ${str(i.type)} ${str(i.relatedIdOrKey)}`, lines: [] }
    case 'add_comment':
      return { title: `Comment on ${str(i.idOrKey)}`, lines: [str(i.body) ?? ''].filter(Boolean) }
    case 'create_doc':
      return {
        title: `Create document "${str(i.title) ?? ''}"`,
        lines: [str(i.content)].filter((v): v is string => Boolean(v)),
      }
    case 'update_doc':
      return {
        title: 'Update document',
        lines: [str(i.title), str(i.content), str(i.appendContent)].filter((v): v is string => Boolean(v)),
      }
    case 'move_doc':
      return { title: 'Move document', lines: [i.parentId ? `New parent: ${i.parentId}` : 'Move to top level'] }
    case 'add_doc_task':
      return { title: 'Add linked task to document', lines: [`Work item: ${str(i.workItemId)}`] }
    case 'toggle_doc_task':
      return { title: 'Toggle document task', lines: [`Set checked: ${String(i.checked)}`] }
    default:
      return { title: toolName, lines: [] }
  }
}

export function WriteConfirmationCard({
  toolName,
  input,
  approvalId,
  onRespond,
}: {
  toolName: string
  input: unknown
  approvalId: string
  onRespond?: (id: string, approved: boolean) => void
}) {
  const { title, lines } = summarize(toolName, input)
  return (
    <div className="w-full max-w-md rounded-xl border bg-card p-3 shadow-xs">
      <p className="text-sm font-medium">{title}</p>
      {lines.map((line, i) => (
        <p key={i} className="mt-1 line-clamp-3 text-xs text-muted-foreground">
          {line}
        </p>
      ))}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onRespond?.(approvalId, false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onRespond?.(approvalId, true)}>
          Confirm
        </Button>
      </div>
    </div>
  )
}

/** Rendered once the approval is resolved (approved & applied handled by the
 * normal output-available path elsewhere; this covers denied/cancelled). */
export function WriteCancelledNote() {
  return (
    <p className={cn('flex items-center gap-1.5 px-1 text-xs italic text-muted-foreground')}>
      <XCircle className="h-3.5 w-3.5" />
      Cancelled — not applied.
    </p>
  )
}

/** A real thrown exception from execute() — state: 'output-error'. Distinct
 * from the tool's own `{ error }` result objects (handled in
 * WriteAppliedChip below), which are expected, caught failures like "no
 * work item found matching X". */
export function ToolErrorNote({ message }: { message?: string }) {
  return (
    <p className="flex items-center gap-1.5 px-1 text-xs text-destructive">
      <XCircle className="h-3.5 w-3.5" />
      {message || 'Something went wrong applying this.'}
    </p>
  )
}

export function WriteAppliedChip({ toolName, output }: { toolName: string; output: unknown }) {
  const o = (output ?? {}) as Record<string, unknown>
  if (typeof o.error === 'string') {
    return (
      <p className="flex items-center gap-1.5 px-1 text-xs text-destructive">
        <XCircle className="h-3.5 w-3.5" />
        {o.error}
      </p>
    )
  }
  const label = typeof o.key === 'string' ? o.key : typeof o.id === 'string' ? o.id : toolName.replace(/_/g, ' ')
  return (
    <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      Done — {label}
    </p>
  )
}
