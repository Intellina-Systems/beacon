import { Pencil } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function WorkItemDescription({
  description,
  editing,
  draft,
  onDraftChange,
  onStartEdit,
  onSave,
  onCancel,
}: {
  description: string | null
  editing: boolean
  draft: string
  onDraftChange: (value: string) => void
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="micro-label">Description</Label>
        {!editing && description && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px] text-muted-foreground"
            onClick={onStartEdit}
          >
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            rows={8}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="Add a description… Markdown supported."
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={onSave}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : description ? (
        <Streamdown className="text-sm leading-relaxed text-foreground/90 [&_a]:text-beacon [&_a]:underline [&_a]:underline-offset-4 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_li]:my-0.5 [&_pre]:max-w-full [&_ul]:list-disc [&_ul]:pl-5">
          {description}
        </Streamdown>
      ) : (
        <Button
          variant="ghost"
          className="h-auto p-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={onStartEdit}
        >
          Add a description…
        </Button>
      )}
    </section>
  )
}
