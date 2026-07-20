'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_META, STATUS_TAB_ORDER } from '@/lib/work-items/constants'
import type { AutomationConditionField, AutomationConditionOp, AutomationActionType } from '@/lib/db/schema'

const TRIGGER_OPTIONS = [
  'task.created',
  'task.status_changed',
  'task.assigned',
  'task.blocked',
  'task.unblocked',
  'task.due_soon',
  'task.overdue',
  'task.relation_added',
  'pr.opened',
  'pr.merged',
  'ci.failed',
  'sprint.item_added',
  'sprint.closed',
]

const FIELD_OPTIONS: { value: AutomationConditionField; label: string }[] = [
  { value: 'workItem.status', label: 'Status' },
  { value: 'workItem.priority', label: 'Priority' },
  { value: 'workItem.kind', label: 'Kind' },
  { value: 'workItem.assigneeMemberId', label: 'Assignee' },
  { value: 'workItem.projectId', label: 'Project' },
  { value: 'workItem.labels', label: 'Labels' },
  { value: 'event.source', label: 'Event source' },
]

const OP_OPTIONS: { value: AutomationConditionOp; label: string }[] = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'in', label: 'is one of (comma-separated)' },
  { value: 'contains', label: 'contains' },
]

const ACTION_OPTIONS: { value: AutomationActionType; label: string }[] = [
  { value: 'set_status', label: 'Set status' },
  { value: 'set_assignee', label: 'Set assignee' },
  { value: 'set_priority', label: 'Set priority' },
  { value: 'add_label', label: 'Add label' },
  { value: 'notify', label: 'Notify' },
]

interface ConditionRow {
  field: AutomationConditionField
  op: AutomationConditionOp
  value: string
}

interface ActionRow {
  type: AutomationActionType
  value: string
}

interface RosterOption {
  id: string
  name: string
}

const EMPTY_CONDITION: ConditionRow = { field: 'workItem.status', op: 'eq', value: 'blocked' }
const EMPTY_ACTION: ActionRow = { type: 'notify', value: 'assignee' }

export function CreateRuleDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [roster, setRoster] = useState<RosterOption[]>([])
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState('task.status_changed')
  const [conditions, setConditions] = useState<ConditionRow[]>([])
  const [actions, setActions] = useState<ActionRow[]>([{ ...EMPTY_ACTION }])

  useEffect(() => {
    if (!open) return
    fetch('/api/members')
      .then((res) => res.json())
      .then((data) =>
        setRoster((data.members ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name }))),
      )
      .catch(() => toast.error('Failed to load members'))
  }, [open])

  function reset() {
    setName('')
    setTrigger('task.status_changed')
    setConditions([])
    setActions([{ ...EMPTY_ACTION }])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || actions.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/automation-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          triggerEventType: trigger,
          conditions: conditions.map((c) => ({
            field: c.field,
            op: c.op,
            value:
              c.op === 'in'
                ? c.value
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean)
                : c.field === 'workItem.priority'
                  ? Number(c.value)
                  : c.value,
          })),
          actions: actions.map((a) => ({
            type: a.type,
            value:
              a.type === 'set_priority'
                ? Number(a.value)
                : a.type === 'set_assignee' && a.value === 'unassign'
                  ? null
                  : a.value,
          })),
        }),
      })
      if (res.ok) {
        toast.success('Rule created')
        setOpen(false)
        reset()
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to create rule')
      }
    } finally {
      setSaving(false)
    }
  }

  function actionValueInput(row: ActionRow, index: number) {
    const update = (value: string) => setActions((prev) => prev.map((a, i) => (i === index ? { ...a, value } : a)))
    switch (row.type) {
      case 'set_status':
        return (
          <Select value={row.value} onValueChange={update}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_TAB_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case 'set_priority':
        return (
          <Select value={row.value} onValueChange={update}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_ORDER.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {PRIORITY_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case 'set_assignee':
        return (
          <Select value={row.value} onValueChange={update}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trigger_actor">Whoever triggered it</SelectItem>
              <SelectItem value="unassign">Unassign</SelectItem>
              {roster.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case 'notify':
        return (
          <Select value={row.value} onValueChange={update}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Who" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="assignee">Current assignee</SelectItem>
              {roster.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case 'add_label':
        return (
          <Input
            className="h-8 text-xs"
            value={row.value}
            onChange={(e) => update(e.target.value)}
            placeholder="Label text"
          />
        )
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Create rule
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create automation rule</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Notify on blocked"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>When this happens</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>If all of these match (optional)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setConditions((prev) => [...prev, { ...EMPTY_CONDITION }])}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Condition
                </Button>
              </div>
              {conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Select
                    value={cond.field}
                    onValueChange={(v) =>
                      setConditions((prev) =>
                        prev.map((c, idx) => (idx === i ? { ...c, field: v as AutomationConditionField } : c)),
                      )
                    }
                  >
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={cond.op}
                    onValueChange={(v) =>
                      setConditions((prev) =>
                        prev.map((c, idx) => (idx === i ? { ...c, op: v as AutomationConditionOp } : c)),
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-28 shrink-0 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OP_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 flex-1 text-xs"
                    value={cond.value}
                    onChange={(e) =>
                      setConditions((prev) => prev.map((c, idx) => (idx === i ? { ...c, value: e.target.value } : c)))
                    }
                    placeholder="value"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
                    onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Then do this</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setActions((prev) => [...prev, { ...EMPTY_ACTION }])}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Action
                </Button>
              </div>
              {actions.map((action, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Select
                    value={action.type}
                    onValueChange={(v) =>
                      setActions((prev) =>
                        prev.map((a, idx) => (idx === i ? { type: v as AutomationActionType, value: '' } : a)),
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-36 shrink-0 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex-1">{actionValueInput(action, i)}</div>
                  {actions.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
                      onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? 'Creating…' : 'Create rule'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
