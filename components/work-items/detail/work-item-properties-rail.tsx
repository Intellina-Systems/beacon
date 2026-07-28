import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { EDITABLE_STATUSES, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_META } from '@/lib/work-items/constants'
import type { ItemDetail, RosterOption } from '@/lib/work-items/types'

function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export function WorkItemPropertiesRail({
  item,
  onItemChange,
  onPatch,
  roster,
  engineOptions,
  teamOptions,
  projectOptions,
  labelsDraft,
  onLabelsDraftChange,
}: {
  item: ItemDetail
  onItemChange: (item: ItemDetail) => void
  onPatch: (body: Record<string, unknown>) => void
  roster: RosterOption[]
  engineOptions: RosterOption[]
  teamOptions: RosterOption[]
  projectOptions: RosterOption[]
  labelsDraft: string
  onLabelsDraftChange: (value: string) => void
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label className="micro-label">Status</Label>
        {item.status === 'triage' ? (
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            Triage
          </Badge>
        ) : (
          <Select value={item.status} onValueChange={(v) => onPatch({ status: v })}>
            <SelectTrigger className="h-8">
              <span className="flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_META[item.status].tone)} />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {EDITABLE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="micro-label">Priority</Label>
        <Select value={String(item.priority ?? 0)} onValueChange={(v) => onPatch({ priority: Number(v) })}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_ORDER.map((p) => (
              <SelectItem key={p} value={String(p)}>
                {PRIORITY_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="micro-label">Assignee</Label>
        <Select
          value={item.assigneeMemberId ?? 'none'}
          onValueChange={(v) => onPatch({ assigneeMemberId: v === 'none' ? null : v })}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {roster.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {projectOptions.length > 1 && (
        <div className="space-y-1.5">
          <Label className="micro-label">Project</Label>
          <Select value={item.projectId} onValueChange={(v) => onPatch({ projectId: v })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projectOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {engineOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label className="micro-label">Engine</Label>
          <Select value={item.engineId ?? 'none'} onValueChange={(v) => onPatch({ engineId: v === 'none' ? null : v })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No engine</SelectItem>
              {engineOptions.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {teamOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label className="micro-label">Team</Label>
          <Select value={item.teamId ?? 'none'} onValueChange={(v) => onPatch({ teamId: v === 'none' ? null : v })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No team</SelectItem>
              {teamOptions.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="micro-label">Estimate</Label>
          <Input
            type="number"
            min={0}
            step="0.5"
            value={item.estimate ?? ''}
            onChange={(e) => onItemChange({ ...item, estimate: e.target.value === '' ? null : Number(e.target.value) })}
            onBlur={() => onPatch({ estimate: item.estimate })}
            className="h-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="micro-label">Due date</Label>
          <Input
            type="date"
            value={toDateInputValue(item.dueDate)}
            onChange={(e) => {
              const value = e.target.value
              onItemChange({ ...item, dueDate: value ? new Date(value).toISOString() : null })
              onPatch({ dueDate: value || null })
            }}
            className="h-8"
          />
        </div>
      </div>

      <LabelsField labels={item.labels} draft={labelsDraft} onDraftChange={onLabelsDraftChange} onPatch={onPatch} />
    </>
  )
}

function LabelsField({
  labels,
  draft,
  onDraftChange,
  onPatch,
}: {
  labels: string[] | null
  draft: string
  onDraftChange: (value: string) => void
  onPatch: (body: Record<string, unknown>) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="micro-label">Labels</Label>
      {labels && labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {labels.map((l) => (
            <Badge key={l} variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">
              {l}
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onBlur={() =>
          onPatch({
            labels: draft
              .split(',')
              .map((l) => l.trim())
              .filter(Boolean),
          })
        }
        placeholder="bug, frontend"
        className="h-8"
      />
    </div>
  )
}
