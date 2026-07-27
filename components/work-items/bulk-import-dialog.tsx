'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KIND_LABEL, KIND_ORDER, PRIORITY_LABEL, PRIORITY_ORDER } from '@/lib/work-items/constants'
import type { WorkItemKind } from '@/lib/db/schema'

interface Option {
  id: string
  name: string
}

const DOTS = 'dots' as const

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

// Bounds the step indicator to a fixed number of slots regardless of task count:
// boundaryCount dots at each end, siblingCount around the current one, ellipsis between.
function getDotWindow(
  current: number,
  total: number,
  siblingCount = 2,
  boundaryCount = 2,
): Array<number | typeof DOTS> {
  const page = current + 1
  if (total <= boundaryCount * 2 + siblingCount * 2 + 3) {
    return Array.from({ length: total }, (_, i) => i)
  }

  const startPages = range(1, boundaryCount)
  const endPages = range(Math.max(total - boundaryCount + 1, boundaryCount + 1), total)

  const siblingsStart = Math.max(
    Math.min(page - siblingCount, total - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2,
  )
  const siblingsEnd = Math.min(Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2), endPages[0] - 2)

  const items: Array<number | typeof DOTS> = [
    ...startPages,
    ...(siblingsStart > boundaryCount + 2
      ? [DOTS]
      : boundaryCount + 1 < total - boundaryCount
        ? [boundaryCount + 1]
        : []),
    ...range(siblingsStart, siblingsEnd),
    ...(siblingsEnd < total - boundaryCount - 1
      ? [DOTS]
      : total - boundaryCount > boundaryCount
        ? [total - boundaryCount]
        : []),
    ...endPages,
  ]

  return items.map((item) => (item === DOTS ? DOTS : item - 1))
}

interface DraftTask {
  include: boolean
  title: string
  description: string | null
  kind: WorkItemKind
  priority: number
  labels: string[]
  dueDate: string | null
  estimate: number | null
  assigneeMemberId: string | null
  projectId: string | null
  engineId: string | null
  teamId: string | null
}

export function BulkImportDialog({ defaultProjectId }: { defaultProjectId?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'paste' | 'review'>('paste')
  const [content, setContent] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [drafts, setDrafts] = useState<DraftTask[]>([])
  const [current, setCurrent] = useState(0)
  const [roster, setRoster] = useState<Option[]>([])
  const [projects, setProjects] = useState<Option[]>([])
  const [engineOptions, setEngineOptions] = useState<Option[]>([])
  const [teamOptions, setTeamOptions] = useState<Option[]>([])

  useEffect(() => {
    if (!open) return
    setStep('paste')
    setContent('')
    setDrafts([])
    setCurrent(0)
    Promise.all([
      fetch('/api/members').then((res) => res.json()),
      fetch('/api/projects').then((res) => res.json()),
      fetch('/api/engines').then((res) => res.json()),
      fetch('/api/teams').then((res) => res.json()),
    ])
      .then(([membersData, projectsData, engineData, teamData]) => {
        setRoster((membersData.members ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })))
        setProjects(
          (projectsData.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
        )
        setEngineOptions(
          (engineData.engines ?? []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })),
        )
        setTeamOptions((teamData.teams ?? []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })))
      })
      .catch(() => toast.error('Failed to load import options'))
  }, [open])

  async function handleExtract() {
    if (!content.trim()) return
    setExtracting(true)
    try {
      const res = await fetch('/api/work-items/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to extract tasks')
        return
      }
      const extracted = data.tasks as Array<Omit<DraftTask, 'include'>>
      setDrafts(
        extracted.map((t) => ({
          ...t,
          include: true,
          projectId: t.projectId ?? defaultProjectId ?? null,
        })),
      )
      setCurrent(0)
      setStep('review')
    } finally {
      setExtracting(false)
    }
  }

  function updateDraft(index: number, patch: Partial<DraftTask>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  async function handleCreate() {
    const selected = drafts.filter((d) => d.include && d.title.trim())
    if (selected.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/work-items/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map((d) => ({
            title: d.title.trim(),
            description: d.description?.trim() || undefined,
            kind: d.kind,
            priority: d.priority,
            assigneeMemberId: d.assigneeMemberId || undefined,
            projectId: d.projectId || undefined,
            engineId: d.engineId || undefined,
            teamId: d.teamId || undefined,
            labels: d.labels?.length ? d.labels : undefined,
            dueDate: d.dueDate || undefined,
            estimate: d.estimate ?? undefined,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Created ${data.items?.length ?? selected.length} task${selected.length === 1 ? '' : 's'}`)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(data.error ?? 'Failed to create tasks')
      }
    } finally {
      setSaving(false)
    }
  }

  const includedCount = drafts.filter((d) => d.include).length

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        Bulk import
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk import tasks</DialogTitle>
          </DialogHeader>

          {step === 'paste' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-content">Paste notes, a spec, a chat log, or anything else with tasks in it</Label>
                <Textarea
                  id="bulk-content"
                  rows={12}
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste meeting notes, a PRD, a Slack thread…"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={extracting || !content.trim()} onClick={handleExtract}>
                  {extracting ? 'Extracting…' : 'Extract tasks'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground">
                  Task {current + 1} of {drafts.length} — review and adjust before creating.
                </p>
                <div className="flex items-center gap-1">
                  {getDotWindow(current, drafts.length).map((slot, i) =>
                    slot === DOTS ? (
                      <span key={`dots-${i}`} className="px-0.5 text-xs leading-none text-muted-foreground">
                        ···
                      </span>
                    ) : (
                      <Button
                        key={slot}
                        type="button"
                        variant="ghost"
                        onClick={() => setCurrent(slot)}
                        title={drafts[slot].title}
                        className={`h-1.5 w-4 shrink-0 rounded-full p-0 hover:bg-transparent ${
                          slot === current
                            ? 'bg-beacon'
                            : drafts[slot].include
                              ? 'bg-muted-foreground/30'
                              : 'bg-muted-foreground/10'
                        }`}
                      />
                    ),
                  )}
                </div>
              </div>

              {drafts[current] && (
                <div className="rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={drafts[current].include}
                      onCheckedChange={(v) => updateDraft(current, { include: v === true })}
                      className="mt-2"
                    />
                    <div className="flex-1 space-y-2">
                      <Input
                        value={drafts[current].title}
                        onChange={(e) => updateDraft(current, { title: e.target.value })}
                        className="font-medium"
                      />
                      <Textarea
                        rows={3}
                        value={drafts[current].description ?? ''}
                        onChange={(e) => updateDraft(current, { description: e.target.value })}
                        placeholder="Description"
                        className="text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Select
                          value={drafts[current].kind}
                          onValueChange={(v) => updateDraft(current, { kind: v as WorkItemKind })}
                        >
                          <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                            <SelectValue className="truncate" />
                          </SelectTrigger>
                          <SelectContent>
                            {KIND_ORDER.map((k) => (
                              <SelectItem key={k} value={k}>
                                {KIND_LABEL[k]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={String(drafts[current].priority)}
                          onValueChange={(v) => updateDraft(current, { priority: Number(v) })}
                        >
                          <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                            <SelectValue className="truncate" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_ORDER.map((p) => (
                              <SelectItem key={p} value={String(p)}>
                                {PRIORITY_LABEL[p]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={drafts[current].assigneeMemberId ?? 'none'}
                          onValueChange={(v) => updateDraft(current, { assigneeMemberId: v === 'none' ? null : v })}
                        >
                          <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                            <SelectValue placeholder="Assignee" className="truncate" />
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
                        <Select
                          value={drafts[current].projectId ?? 'default'}
                          onValueChange={(v) => updateDraft(current, { projectId: v === 'default' ? null : v })}
                        >
                          <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                            <SelectValue placeholder="Project" className="truncate" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">General</SelectItem>
                            {projects
                              .filter((p) => p.name !== 'General')
                              .map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {engineOptions.length > 0 && (
                          <Select
                            value={drafts[current].engineId ?? 'none'}
                            onValueChange={(v) => updateDraft(current, { engineId: v === 'none' ? null : v })}
                          >
                            <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                              <SelectValue placeholder="Engine" className="truncate" />
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
                        )}
                        {teamOptions.length > 0 && (
                          <Select
                            value={drafts[current].teamId ?? 'none'}
                            onValueChange={(v) => updateDraft(current, { teamId: v === 'none' ? null : v })}
                          >
                            <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                              <SelectValue placeholder="Team" className="truncate" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No team</SelectItem>
                              {teamOptions.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={current === 0}
                  onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={current === drafts.length - 1}
                  onClick={() => setCurrent((c) => Math.min(drafts.length - 1, c + 1))}
                >
                  Next
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setStep('paste')}>
                  Back
                </Button>
                <Button type="button" disabled={saving || includedCount === 0} onClick={handleCreate}>
                  {saving ? 'Creating…' : `Create ${includedCount} task${includedCount === 1 ? '' : 's'}`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
