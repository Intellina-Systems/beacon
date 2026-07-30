'use client'

import { ImagePlus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarkdownBody } from './markdown-body'
import { MarkdownComposer } from './markdown-composer'

export function WorkItemDescription({
  workItemId,
  description,
  editing,
  draft,
  saving,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
  onUploaded,
}: {
  workItemId: string
  description: string | null
  editing: boolean
  draft: string
  saving?: boolean
  onDraftChange: (value: string) => void
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
  onUploaded?: () => void
}) {
  if (editing) {
    return (
      <MarkdownComposer
        value={draft}
        onChange={onDraftChange}
        workItemId={workItemId}
        autoFocus
        minHeight={220}
        onUploaded={onUploaded}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              Save
            </Button>
          </>
        }
      />
    )
  }

  if (!description) {
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="group flex w-full items-center gap-2 rounded-lg border border-dashed px-3.5 py-4 text-left text-sm text-muted-foreground transition-colors hover:border-beacon/40 hover:bg-beacon/[0.03] hover:text-foreground"
      >
        <ImagePlus className="h-4 w-4 shrink-0 opacity-60" />
        Add a description — paste screenshots straight in
      </button>
    )
  }

  return (
    <div className="group relative">
      <MarkdownBody>{description}</MarkdownBody>
      <Button
        size="sm"
        variant="outline"
        onClick={onStartEdit}
        className="absolute -top-1 right-0 h-7 px-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Pencil className="mr-1 h-3 w-3" />
        Edit
      </Button>
    </div>
  )
}
