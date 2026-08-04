'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { KIND_LABEL } from '@/lib/work-items/constants'
import type { ResolvedTask } from '@/lib/work-items/bulk-import'
import type { docSchema } from './doc-schema'
import type { TaskProposalOptions } from './slash-commands/ai-items'

type DocEditorInstance = typeof docSchema.BlockNoteEditor

// Nothing is created until "Create" is confirmed here — the same
// propose-then-review restraint components/work-items/bulk-import-dialog.tsx
// already applies to the identical extraction call. Creation itself reuses
// the existing /api/work-items/bulk endpoint (insertWorkItem under the hood);
// this dialog is only about the doc-specific review + insert-back-into-doc step.
export function GenerateTasksDialog({
  editor,
  tasks,
  options,
  onClose,
}: {
  editor: DocEditorInstance
  tasks: ResolvedTask[] | null
  options: TaskProposalOptions | null
  onClose: () => void
}) {
  const [included, setIncluded] = useState<boolean[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    setIncluded(tasks ? tasks.map(() => true) : [])
  }, [tasks])

  function memberName(id: string | null) {
    return id ? options?.members.find((m) => m.id === id)?.name : undefined
  }
  function projectName(id: string | null) {
    return id ? options?.projects.find((p) => p.id === id)?.name : undefined
  }

  async function handleCreate() {
    if (!tasks) return
    const selected = tasks.filter((_, i) => included[i])
    if (selected.length === 0) return
    setCreating(true)
    try {
      const res = await fetch('/api/work-items/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map((t) => ({
            title: t.title,
            description: t.description ?? undefined,
            kind: t.kind,
            priority: t.priority,
            assigneeMemberId: t.assigneeMemberId ?? undefined,
            projectId: t.projectId ?? undefined,
            engineId: t.engineId ?? undefined,
            teamId: t.teamId ?? undefined,
            labels: t.labels.length ? t.labels : undefined,
            dueDate: t.dueDate ?? undefined,
            estimate: t.estimate ?? undefined,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to create tasks')
        return
      }
      const created = data.items as { id: string; key: string | null; title: string; status: string }[]
      const blocks: (typeof docSchema.PartialBlock)[] = created.map((item) => ({
        type: 'checkListItem',
        content: [
          {
            type: 'workItemMention',
            props: { itemId: item.id, itemKey: item.key ?? '', title: item.title, status: item.status },
          },
          ' ',
        ],
      }))
      // Appended at the document's end rather than a tracked cursor position —
      // by the time this async confirm resolves the cursor may have moved, and
      // "end of doc" is a predictable, always-valid insertion point.
      const trailing = editor.document[editor.document.length - 1]
      editor.insertBlocks(blocks, trailing, 'after')
      toast.success(`Created ${created.length} task${created.length === 1 ? '' : 's'}`)
      onClose()
    } finally {
      setCreating(false)
    }
  }

  const includedCount = included.filter(Boolean).length

  return (
    <Dialog open={tasks !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review extracted tasks</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {tasks?.map((task, i) => (
            <label key={i} className="flex items-start gap-2 rounded-md border p-2.5 text-sm">
              <Checkbox
                checked={included[i] ?? true}
                onCheckedChange={(v) => setIncluded((prev) => prev.map((b, idx) => (idx === i ? v === true : b)))}
                className="mt-0.5"
              />
              <span className="flex-1 space-y-0.5">
                <span className="block font-medium">{task.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {KIND_LABEL[task.kind]}
                  {projectName(task.projectId) ? ` · ${projectName(task.projectId)}` : ''}
                  {memberName(task.assigneeMemberId) ? ` · ${memberName(task.assigneeMemberId)}` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={creating || includedCount === 0} onClick={handleCreate}>
            {creating ? 'Creating…' : `Create ${includedCount} task${includedCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
