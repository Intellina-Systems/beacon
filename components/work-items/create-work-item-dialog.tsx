'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KIND_LABEL, KIND_ORDER, PRIORITY_LABEL, PRIORITY_ORDER } from '@/lib/work-items/constants'
import type { WorkItemKind, WorkItemTemplateDefaults } from '@/lib/db/schema'

interface Option {
  id: string
  name: string
}

interface TemplateOption {
  id: string
  name: string
  defaults: WorkItemTemplateDefaults
}

const EMPTY_FORM = {
  title: '',
  description: '',
  kind: 'task' as WorkItemKind,
  status: 'todo' as 'todo' | 'triage' | 'backlog',
  priority: 0,
  assigneeMemberId: '',
  projectId: '',
  engineId: '',
  functionId: '',
  estimate: '',
  dueDate: '',
  labels: '',
}

export function CreateWorkItemDialog({ defaultProjectId }: { defaultProjectId?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [roster, setRoster] = useState<Option[]>([])
  const [projects, setProjects] = useState<Option[]>([])
  const [engineOptions, setEngineOptions] = useState<Option[]>([])
  const [functionOptions, setFunctionOptions] = useState<Option[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [templateId, setTemplateId] = useState('none')
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    if (!open) return
    setForm({ ...EMPTY_FORM, projectId: defaultProjectId ?? '' })
    setTemplateId('none')
    Promise.all([
      fetch('/api/members').then((res) => res.json()),
      fetch('/api/projects').then((res) => res.json()),
      fetch('/api/work-item-templates').then((res) => res.json()),
      fetch('/api/engines').then((res) => res.json()),
      fetch('/api/functions').then((res) => res.json()),
    ])
      .then(([membersData, projectsData, templatesData, engineData, functionData]) => {
        setRoster((membersData.members ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })))
        setProjects(
          (projectsData.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
        )
        setTemplates(templatesData.templates ?? [])
        setEngineOptions(
          (engineData.engines ?? []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })),
        )
        setFunctionOptions(
          (functionData.functions ?? []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })),
        )
      })
      .catch(() => toast.error('Failed to load create-issue options'))
  }, [open, defaultProjectId])

  function applyTemplate(id: string) {
    setTemplateId(id)
    if (id === 'none') return
    const template = templates.find((t) => t.id === id)
    if (!template) return
    const d = template.defaults
    setForm((prev) => ({
      ...prev,
      title: d.title ?? prev.title,
      description: d.description ?? prev.description,
      kind: d.kind ?? prev.kind,
      status: (d.status as 'todo' | 'triage' | 'backlog') ?? prev.status,
      priority: d.priority ?? prev.priority,
      labels: d.labels?.join(', ') ?? prev.labels,
      estimate: d.estimate != null ? String(d.estimate) : prev.estimate,
      assigneeMemberId: d.assigneeMemberId ?? prev.assigneeMemberId,
      projectId: d.projectId ?? prev.projectId,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/work-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          kind: form.kind,
          status: form.status,
          priority: form.priority,
          assigneeMemberId: form.assigneeMemberId || undefined,
          projectId: form.projectId || undefined,
          engineId: form.engineId || undefined,
          functionId: form.functionId || undefined,
          estimate: form.estimate ? Number(form.estimate) : undefined,
          dueDate: form.dueDate || undefined,
          labels: form.labels
            ? form.labels
                .split(',')
                .map((l) => l.trim())
                .filter(Boolean)
            : undefined,
        }),
      })
      if (res.ok) {
        toast.success('Work item created')
        setOpen(false)
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to create work item')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Create
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create work item</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={applyTemplate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No template</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                autoFocus
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Kind</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as WorkItemKind }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_ORDER.map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Starting status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof form.status }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="triage">Triage</SelectItem>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="todo">Todo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={String(form.priority)}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: Number(v) }))}
                >
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
                <Label>Assignee</Label>
                <Select
                  value={form.assigneeMemberId || 'none'}
                  onValueChange={(v) => setForm((f) => ({ ...f, assigneeMemberId: v === 'none' ? '' : v }))}
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

            {projects.length > 1 && (
              <div className="space-y-2">
                <Label>Project</Label>
                <Select
                  value={form.projectId || 'default'}
                  onValueChange={(v) => setForm((f) => ({ ...f, projectId: v === 'default' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
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
              </div>
            )}

            {(engineOptions.length > 0 || functionOptions.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {engineOptions.length > 0 && (
                  <div className="space-y-2">
                    <Label>Engine</Label>
                    <Select
                      value={form.engineId || 'none'}
                      onValueChange={(v) => setForm((f) => ({ ...f, engineId: v === 'none' ? '' : v }))}
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
                    <Label>Team</Label>
                    <Select
                      value={form.functionId || 'none'}
                      onValueChange={(v) => setForm((f) => ({ ...f, functionId: v === 'none' ? '' : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No team</SelectItem>
                        {functionOptions.map((fn) => (
                          <SelectItem key={fn.id} value={fn.id}>
                            {fn.name}
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
                <Label htmlFor="estimate">Estimate</Label>
                <Input
                  id="estimate"
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.estimate}
                  onChange={(e) => setForm((f) => ({ ...f, estimate: e.target.value }))}
                  placeholder="Points"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="labels">Labels</Label>
              <Input
                id="labels"
                value={form.labels}
                onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
                placeholder="bug, frontend, urgent"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.title.trim()}>
                {saving ? 'Creating…' : 'Create work item'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
