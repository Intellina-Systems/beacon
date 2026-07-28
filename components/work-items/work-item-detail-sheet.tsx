'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Check, Clock, ExternalLink, Eye, EyeOff, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Streamdown } from 'streamdown'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import { relativeTime } from '@/lib/utils/relative-time'
import { EDITABLE_STATUSES, KIND_LABEL, PRIORITY_LABEL, PRIORITY_ORDER, STATUS_META } from '@/lib/work-items/constants'
import { PickWorkItemDialog, type PickableWorkItem } from './pick-work-item-dialog'
import { DocBacklinks } from './doc-backlinks'
import type { WorkItemRelationType, WorkItemStatus } from '@/lib/db/schema'

interface ActivityEvent {
  id: string
  type: string
  summary: string
  source: string
  actorLabel: string | null
  memberName: string | null
  occurredAt: string
}

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
  projectId: string
  engineId: string | null
  teamId: string | null
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
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [relations, setRelations] = useState<RelationsView | null>(null)
  const [watchers, setWatchers] = useState<WatcherEntry[]>([])
  const [engineOptions, setEngineOptions] = useState<RosterOption[]>([])
  const [teamOptions, setTeamOptions] = useState<RosterOption[]>([])
  const [projectOptions, setProjectOptions] = useState<RosterOption[]>([])
  const [loading, setLoading] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [labelsDraft, setLabelsDraft] = useState('')
  const [pickerFor, setPickerFor] = useState<WorkItemRelationType | 'duplicate-triage' | null>(null)
  const [addWatcherId, setAddWatcherId] = useState('')

  const load = useCallback(async () => {
    if (!itemId) return
    setLoading(true)
    try {
      const [itemRes, relationsRes, watchersRes, engineRes, teamRes, projectRes] = await Promise.all([
        fetch(`/api/work-items/${itemId}`),
        fetch(`/api/work-items/${itemId}/relations`),
        fetch(`/api/work-items/${itemId}/watchers`),
        fetch('/api/engines'),
        fetch('/api/teams'),
        fetch('/api/projects'),
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
      const teamData = await teamRes.json().catch(() => ({}))
      const projectData = await projectRes.json().catch(() => ({}))
      setItem(itemData.item)
      setEvents(itemData.events ?? [])
      setDescriptionDraft(itemData.item.description ?? '')
      setLabelsDraft((itemData.item.labels ?? []).join(', '))
      setRelations(relationsData.relations)
      setWatchers(watchersData.watchers ?? [])
      setEngineOptions(
        (engineData.engines ?? []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })),
      )
      setTeamOptions((teamData.teams ?? []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })))
      setProjectOptions(
        (projectData.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
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
      setEvents([])
      setRelations(null)
      setWatchers([])
      setPickerFor(null)
      setEditingDesc(false)
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
      <DrawerContent className="!w-full sm:!max-w-3xl">
        {loading || !item ? (
          <div className="flex h-full flex-col gap-4 p-6">
            <DrawerTitle className="sr-only">Loading work item</DrawerTitle>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <DrawerHeader className="shrink-0 space-y-0 border-b px-6 py-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {item.key && <span className="font-mono text-xs text-muted-foreground">{item.key}</span>}
                  <Badge variant="secondary" className="px-1.5 py-0 font-mono text-[10px] uppercase">
                    {KIND_LABEL[item.kind]}
                  </Badge>
                  {item.externalUrl && (
                    <a
                      href={item.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      title="Open in tracker"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this work item?</AlertDialogTitle>
                      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <DrawerTitle className="sr-only">{item.title}</DrawerTitle>
            </DrawerHeader>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
              {/* Main column — the issue as a document */}
              <div className="min-w-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                <Input
                  value={item.title}
                  onChange={(e) => setItem({ ...item, title: e.target.value })}
                  onBlur={() => item.title.trim() && patch({ title: item.title.trim() })}
                  placeholder="Untitled"
                  className="h-auto border-none px-0 text-2xl font-semibold leading-tight tracking-tight shadow-none focus-visible:ring-0"
                />

                {item.status === 'triage' && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2.5">
                    <span className="micro-label mr-1">Triage</span>
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
                )}

                {/* Description — rendered markdown, click to edit */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="micro-label">Description</Label>
                    {!editingDesc && item.description && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px] text-muted-foreground"
                        onClick={() => setEditingDesc(true)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                    )}
                  </div>
                  {editingDesc ? (
                    <div className="space-y-2">
                      <Textarea
                        rows={8}
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        placeholder="Add a description… Markdown supported."
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (descriptionDraft !== (item.description ?? ''))
                              patch({ description: descriptionDraft || null })
                            setItem({ ...item, description: descriptionDraft || null })
                            setEditingDesc(false)
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDescriptionDraft(item.description ?? '')
                            setEditingDesc(false)
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : item.description ? (
                    <Streamdown className="text-sm leading-relaxed text-foreground/90 [&_a]:text-beacon [&_a]:underline [&_a]:underline-offset-4 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_li]:my-0.5 [&_pre]:max-w-full [&_ul]:list-disc [&_ul]:pl-5">
                      {item.description}
                    </Streamdown>
                  ) : (
                    <Button
                      variant="ghost"
                      className="h-auto p-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
                      onClick={() => setEditingDesc(true)}
                    >
                      Add a description…
                    </Button>
                  )}
                </section>

                {/* Relations */}
                <section className="space-y-3">
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
                        <RelationGroup
                          label="Duplicate of"
                          entries={[relations.duplicateOf]}
                          onRemove={removeRelation}
                        />
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
                </section>

                {/* Docs that reference this item via a `#` mention */}
                {itemId && <DocBacklinks workItemId={itemId} />}

                {/* Activity — the real derived history from the event stream */}
                <section className="space-y-3">
                  <Label className="micro-label">Activity</Label>
                  {events.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No activity yet.</p>
                  ) : (
                    <div className="ml-1 border-l pl-4">
                      {events.map((e) => (
                        <div key={e.id} className="relative py-2">
                          <span className="absolute -left-[19px] top-[13px] h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                          <p className="text-sm leading-snug">{e.summary}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span className="font-mono text-[11px]">{e.type}</span>
                            {(e.memberName ?? e.actorLabel) && (
                              <span className="font-medium text-foreground/70">{e.memberName ?? e.actorLabel}</span>
                            )}
                            <span className="font-mono text-[11px]">{relativeTime(new Date(e.occurredAt))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Properties rail */}
              <aside className="shrink-0 space-y-4 overflow-y-auto border-t bg-muted/20 px-5 py-5 lg:w-[248px] lg:border-l lg:border-t-0">
                <div className="space-y-1.5">
                  <Label className="micro-label">Status</Label>
                  {item.status === 'triage' ? (
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      Triage
                    </Badge>
                  ) : (
                    <Select value={item.status} onValueChange={(v) => patch({ status: v })}>
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
                  <Select value={String(item.priority ?? 0)} onValueChange={(v) => patch({ priority: Number(v) })}>
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
                    onValueChange={(v) => patch({ assigneeMemberId: v === 'none' ? null : v })}
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
                    <Select value={item.projectId} onValueChange={(v) => patch({ projectId: v })}>
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
                    <Select
                      value={item.engineId ?? 'none'}
                      onValueChange={(v) => patch({ engineId: v === 'none' ? null : v })}
                    >
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
                    <Select
                      value={item.teamId ?? 'none'}
                      onValueChange={(v) => patch({ teamId: v === 'none' ? null : v })}
                    >
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
                      onChange={(e) =>
                        setItem({ ...item, estimate: e.target.value === '' ? null : Number(e.target.value) })
                      }
                      onBlur={() => patch({ estimate: item.estimate })}
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
                        setItem({ ...item, dueDate: value ? new Date(value).toISOString() : null })
                        patch({ dueDate: value || null })
                      }}
                      className="h-8"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="micro-label">Labels</Label>
                  {item.labels && item.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.labels.map((l) => (
                        <Badge key={l} variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  )}
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
                    className="h-8"
                  />
                </div>

                {/* Watchers */}
                <div className="space-y-2 border-t pt-4">
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
                      <div key={w.memberId} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">
                          {w.name} <span className="text-muted-foreground">· {w.reason}</span>
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 shrink-0 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                          onClick={() => removeWatcherEntry(w.memberId)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
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
              </aside>
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
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => onRemove(entry.relationId)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
