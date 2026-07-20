'use client'

import { useEffect, useState } from 'react'
import { LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KIND_LABEL, KIND_ORDER, PRIORITY_LABEL, PRIORITY_ORDER } from '@/lib/work-items/constants'
import type { WorkItemKind, WorkItemTemplateDefaults } from '@/lib/db/schema'

interface TemplateRow {
  id: string
  name: string
  description: string | null
  defaults: WorkItemTemplateDefaults
}

const EMPTY_NEW = {
  name: '',
  kind: 'task' as WorkItemKind,
  priority: 0,
  labels: '',
  estimate: '',
}

export function ManageTemplatesDialog() {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_NEW)

  function load() {
    setLoading(true)
    fetch('/api/work-item-templates')
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/work-item-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          defaults: {
            kind: form.kind,
            priority: form.priority,
            labels: form.labels
              ? form.labels
                  .split(',')
                  .map((l) => l.trim())
                  .filter(Boolean)
              : undefined,
            estimate: form.estimate ? Number(form.estimate) : undefined,
          },
        }),
      })
      if (res.ok) {
        toast.success('Template created')
        setForm(EMPTY_NEW)
        load()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to create template')
      }
    } finally {
      setCreating(false)
    }
  }

  async function remove(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/work-item-templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id))
      } else {
        toast.error('Failed to delete template')
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <LayoutTemplate className="mr-1.5 h-3.5 w-3.5" />
        Templates
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue templates</DialogTitle>
          </DialogHeader>

          {loading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No templates yet — create one below.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.defaults.kind ? KIND_LABEL[t.defaults.kind] : 'Task'}
                      {t.defaults.priority ? ` · ${PRIORITY_LABEL[t.defaults.priority]}` : ''}
                      {t.defaults.labels?.length ? ` · ${t.defaults.labels.join(', ')}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
                    disabled={busyId === t.id}
                    onClick={() => remove(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={createTemplate} className="space-y-3 border-t pt-4">
            <p className="micro-label">New template</p>
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Bug report"
                required
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tpl-labels">Labels</Label>
                <Input
                  id="tpl-labels"
                  value={form.labels}
                  onChange={(e) => setForm((f) => ({ ...f, labels: e.target.value }))}
                  placeholder="bug, urgent"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-estimate">Estimate</Label>
                <Input
                  id="tpl-estimate"
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.estimate}
                  onChange={(e) => setForm((f) => ({ ...f, estimate: e.target.value }))}
                />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={creating || !form.name.trim()} className="w-full">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {creating ? 'Creating…' : 'Add template'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
