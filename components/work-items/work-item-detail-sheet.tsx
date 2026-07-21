'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Check, Clock, Eye, EyeOff, Trash2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { EDITABLE_STATUSES, KIND_LABEL, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_META } from '@/lib/work-items/constants'
import { PickWorkItemDialog, type PickableWorkItem } from './pick-work-item-dialog'
import type { WorkItemRelationType, WorkItemStatus } from '@/lib/db/schema'

interface RosterOption {
  id: string
  name: string
}

interface ItemDetail {
  id: string
  key: string | null
  title: string
  description: string | null
  kind: 'epic' | 'feature' | 'task'
  status: WorkItemStatus
  priority: number | null
  assigneeMemberId: string | null
  labels: string[] | null
  dueDate: string | null
  estimate: number | null
  snoozedUntil: string | null
  externalUrl: string | null
  engineId: string | null
  functionId: string | null
}

interface RelationEntry {
  relationId: string
  item: { id: string; key: string | null; title: string; status: WorkItemStatus }
}

interface RelationsView {
  blocks: RelationEntry[]
  blockedBy: RelationEntry[]
  duplicateOf: RelationEntry | null
  duplicates: RelationEntry[]
  related: RelationEntry[]
}

interface WatcherEntry {
  memberId: string
  reason: string
  name: string
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export function WorkItemDetailSheet({
  itemId,
  open,
  onClose,
  roster,
  currentMemberId,
}: {
  itemId: string | null
  open: boolean
  onClose: () => void
  roster: RosterOption[]
  currentMemberId: string
}) {
  const router = useRouter()
  const [item, setItem] = useState<ItemDetail | null>(null)
  const [relations, setRelations] = useState<RelationsView | null>(null)
  const [watchers, setWatchers] = useState<WatcherEntry[]>([])
  const [engineOptions, setEngineOptions] = useState<RosterOption[]>([])
  const [functionOptions, setFunctionOptions] = useState<RosterOption[]>([])
  const [loading, setLoading] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [labelsDraft, setLabelsDraft] = useState('')
  const [pickerFor, setPickerFor] = useState<WorkItemRelationType | 'duplicate-triage' | null>(null)
  const [addWatcherId, setAddWatcherId] = useState('')

  const load = useCallback(async () => {
    if (!itemId) return
    setLoading(true)
    try {
      const [itemRes, relationsRes, watchersRes, engineRes, functionRes] = await Promise.all([
        fetch(`/api/work-items/${itemId}`),
        fetch(`/api/work-items/${itemId}/relations`),
        fetch(`/api/work-items/${itemId}/watchers`),
        fetch('/api/engines'),
        fetch('/api/functions'),
      ])
      if (!itemRes.ok) {
        toast.error('Failed to load work item')
        onClose()
        return
      }
      const itemData = await itemRes.json()
      const relationsData = await relationsRes.json()
      const watchersData = await watchersRes.json()
      const engineData = await engineRes.json().catch(() => ({}))
      const functionData = await functionRes.json().catch(() => ({}))
      setItem(itemData.item)
      setDescriptionDraft(itemData.item.description ?? '')
      setLabelsDraft((itemData.item.labels ?? []).join(', '))
      setRelations(relationsData.relations)
      setWatchers(watchersData.watchers ?? [])
      setEngineOptions(
        (engineData.engines ?? []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })),
      )
      setFunctionOptions(
        (functionData.functions ?? []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })),
      )
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId])

  useEffect(() => {
    if (open && itemId) load()
    if (!open) {
      setItem(null)
      setRelations(null)
      setWatchers([])
      setPickerFor(null)
    }
  }, [open, itemId, load])

  async function patch(body: Record<string, unknown>) {
    if (!itemId) return
    const res = await fetch(`/api/work-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = await res.json()
      setItem(data.item)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to update work item')
    }
  }

  async function triage(body: Record<string, unknown>) {
    if (!itemId) return
    const res = await fetch(`/api/work-items/${itemId}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = await res.json()
      setItem(data.item)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Triage action failed')
    }
  }

  async function addRelation(relatedItemId: string, type: WorkItemRelationType) {
    if (!itemId) return
    const res = await fetch(`/api/work-items/${itemId}/relations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relatedItemId, type }),
    })
    if (res.ok) {
      toast.success(type === 'duplicate' ? 'Marked as duplicate' : 'Relation added')
      load()
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to add relation')
    }
  }

  async function removeRelation(relationId: string) {
    if (!itemId) return
    const res = await fetch(`/api/work-items/${itemId}/relations/${relationId}`, { method: 'DELETE' })
    if (res.ok) {
      load()
      router.refresh()
    } else {
      toast.error('Failed to remove relation')
    }
  }

  async function toggleWatch(watching: boolean) {
    if (!itemId) return
    if (watching) {
      const res = await fetch(`/api/work-items/${itemId}/watchers?memberId=${currentMemberId}`, { method: 'DELETE' })
      if (res.ok) load()
    } else {
      const res = await fetch(`/api/work-items/${itemId}/watchers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) load()
    }
  }

  async function addWatcher() {
    if (!itemId || !addWatcherId) return
    const res = await fetch(`/api/work-items/${itemId}/watchers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: addWatcherId }),
    })
    if (res.ok) {
      setAddWatcherId('')
      load()
    } else {
      toast.error('Failed to add watcher')
    }
  }

  async function removeWatcherEntry(memberId: string) {
    if (!itemId) return
    const res = await fetch(`/api/work-items/${itemId}/watchers?memberId=${memberId}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  async function handleDelete() {
    if (!itemId) return
    if (!window.confirm('Delete this work item? This cannot be undone.')) return
    const res = await fetch(`/api/work-items/${itemId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Work item deleted')
      onClose()
      router.refresh()
    } else {
      toast.error('Failed to delete work item')
    }
  }

  const isWatching = watchers.some((w) => w.memberId === currentMemberId)
  const watcherIds = new Set(watchers.map((w) => w.memberId))
  const relatedIds = relations
    ? [
        item?.id,
        ...relations.blocks.map((r) => r.item.id),
        ...relations.blockedBy.map((r) => r.item.id),
        ...(relations.duplicateOf ? [relations.duplicateOf.item.id] : []),
        ...relations.duplicates.map((r) => r.item.id),
        ...relations.related.map((r) => r.item.id),
      ].filter((id): id is string => !!id)
    : item
      ? [item.id]
      : []

  return (
    <Drawer open={open} onOpenChange={(value) => !value && onClose()} direction="right">
      <DrawerContent className="!w-full sm:!max-w-lg">
        {loading || !item ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="flex h-full flex-col overflow-y-auto">
            <DrawerHeader className="border-b text-left">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {item.key && <span className="font-mono text-xs text-muted-foreground">{item.key}</span>}
                  <Badge variant="secondary" className="px-1.5 py-0 font-mono text-[10px] uppercase">
                    {KIND_LABEL[item.kind]}
                  </Badge>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                value={item.title}
                onChange={(e) => setItem({ ...item, title: e.target.value })}
                onBlur={() => item.title.trim() && patch({ title: item.title.trim() })}
                className="mt-2 border-none px-0 text-base font-semibold shadow-none focus-visible:ring-0"
              />
              <DrawerTitle className="sr-only">{item.title}</DrawerTitle>
            </DrawerHeader>

            <div className="flex-1 space-y-5 px-4 py-4">
              {/* Status / triage actions */}
              <div className="space-y-2">
                <Label className="micro-label">Status</Label>
                {item.status === 'triage' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => triage({ action: 'accept' })}>
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => triage({ action: 'decline' })}>
                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                      Decline
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        triage({ action: 'snooze', until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
                      }
                    >
                      <Clock className="mr-1.5 h-3.5 w-3.5" />
                      Snooze 1d
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPickerFor('duplicate-triage')}>
                      Mark duplicate
                    </Button>
                  </div>
                ) : (
                  <Select value={item.status} onValueChange={(v) => patch({ status: v })}>
                    <SelectTrigger>
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="micro-label">Priority</Label>
                  <Select value={String(item.priority ?? 0)} onValueChange={(v) => patch({ priority: Number(v) })}>
                    <SelectTrigger>
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
                <div className="space-y-2">
                  <Label className="micro-label">Assignee</Label>
                  <Select
                    value={item.assigneeMemberId ?? 'none'}
                    onValueChange={(v) => patch({ assigneeMemberId: v === 'none' ? null : v })}
                  >
                    <SelectTrigger>
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
              </div>

              {(engineOptions.length > 0 || functionOptions.length > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  {engineOptions.length > 0 && (
                    <div className="space-y-2">
                      <Label className="micro-label">Engine</Label>
                      <Select
                        value={item.engineId ?? 'none'}
                        onValueChange={(v) => patch({ engineId: v === 'none' ? null : v })}
                      >
                        <SelectTrigger>
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
                  {functionOptions.length > 0 && (
                    <div className="space-y-2">
                      <Label className="micro-label">Team</Label>
                      <Select
                        value={item.functionId ?? 'none'}
                        onValueChange={(v) => patch({ functionId: v === 'none' ? null : v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No team</SelectItem>
                          {functionOptions.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="micro-label">Estimate</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={item.estimate ?? ''}
                    onChange={(e) =>
                      setItem({ ...item, estimate: e.target.value === '' ? null : Number(e.target.value) })
                    }
                    onBlur={() => patch({ estimate: item.estimate })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="micro-label">Due date</Label>
                  <Input
                    type="date"
                    value={toDateInputValue(item.dueDate)}
                    onChange={(e) => {
                      const value = e.target.value
                      setItem({ ...item, dueDate: value ? new Date(value).toISOString() : null })
                      patch({ dueDate: value || null })
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="micro-label">Labels</Label>
                <Input
                  value={labelsDraft}
                  onChange={(e) => setLabelsDraft(e.target.value)}
                  onBlur={() =>
                    patch({
                      labels: labelsDraft
                        .split(',')
                        .map((l) => l.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="bug, frontend"
                />
              </div>

              <div className="space-y-2">
                <Label className="micro-label">Description</Label>
                <Textarea
                  rows={4}
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  onBlur={() =>
                    descriptionDraft !== (item.description ?? '') && patch({ description: descriptionDraft || null })
                  }
                />
              </div>

              {/* Relations */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="micro-label">Relations</Label>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setPickerFor('blocks')}
                    >
                      + Blocks
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setPickerFor('related')}
                    >
                      + Related
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setPickerFor('duplicate')}
                    >
                      + Duplicate
                    </Button>
                  </div>
                </div>

                {relations && (
                  <div className="space-y-2 text-xs">
                    <RelationGroup label="Blocks" entries={relations.blocks} onRemove={removeRelation} />
                    <RelationGroup label="Blocked by" entries={relations.blockedBy} onRemove={removeRelation} />
                    {relations.duplicateOf && (
                      <RelationGroup label="Duplicate of" entries={[relations.duplicateOf]} onRemove={removeRelation} />
                    )}
                    <RelationGroup label="Duplicates" entries={relations.duplicates} onRemove={removeRelation} />
                    <RelationGroup label="Related" entries={relations.related} onRemove={removeRelation} />
                    {relations.blocks.length === 0 &&
                      relations.blockedBy.length === 0 &&
                      !relations.duplicateOf &&
                      relations.duplicates.length === 0 &&
                      relations.related.length === 0 && <p className="text-muted-foreground">No relations yet.</p>}
                  </div>
                )}
              </div>

              {/* Watchers */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="micro-label">Watchers</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => toggleWatch(isWatching)}
                  >
                    {isWatching ? (
                      <>
                        <EyeOff className="mr-1 h-3 w-3" />
                        Unwatch
                      </>
                    ) : (
                      <>
                        <Eye className="mr-1 h-3 w-3" />
                        Watch
                      </>
                    )}
                  </Button>
                </div>
                <div className="space-y-1">
                  {watchers.map((w) => (
                    <div key={w.memberId} className="flex items-center justify-between text-xs">
                      <span>
                        {w.name} <span className="text-muted-foreground">· {w.reason}</span>
                      </span>
                      <button
                        onClick={() => removeWatcherEntry(w.memberId)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Select value={addWatcherId} onValueChange={setAddWatcherId}>
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue placeholder="Add a watcher…" />
                    </SelectTrigger>
                    <SelectContent>
                      {roster
                        .filter((m) => !watcherIds.has(m.id))
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 px-2"
                    disabled={!addWatcherId}
                    onClick={addWatcher}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DrawerContent>

      <PickWorkItemDialog
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        excludeIds={relatedIds}
        title={
          pickerFor === 'blocks'
            ? 'This item blocks…'
            : pickerFor === 'related'
              ? 'Relate to…'
              : 'Mark as a duplicate of…'
        }
        onPick={(picked: PickableWorkItem) => {
          if (pickerFor === 'duplicate-triage') {
            addRelation(picked.id, 'duplicate')
          } else if (pickerFor) {
            addRelation(picked.id, pickerFor as WorkItemRelationType)
          }
        }}
      />
    </Drawer>
  )
}

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
            <button
              onClick={() => onRemove(entry.relationId)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
