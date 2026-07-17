'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, FolderKanban, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ProjectStatus = 'active' | 'paused' | 'archived'

interface ProjectRow {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  itemCount: number
}

function ProjectItem({
  project,
  canDelete,
  onChanged,
}: {
  project: ProjectRow
  canDelete: boolean
  onChanged: () => void
}) {
  const [name, setName] = useState(project.name)
  const [status, setStatus] = useState<ProjectStatus>(project.status)
  const [busy, setBusy] = useState(false)
  const dirty = name.trim() !== project.name || status !== project.status

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), status }),
      })
      if (res.ok) onChanged()
      else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(body?.error ?? 'Failed to update project')
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete project "${project.name}"?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      if (res.ok) onChanged()
      else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(body?.error ?? 'Failed to delete project')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 flex-1 text-sm" disabled={busy} />
      <Select value={status} onValueChange={(value) => setStatus(value as ProjectStatus)} disabled={busy}>
        <SelectTrigger size="sm" className="h-8 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="paused">Paused</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>
      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
        {project.itemCount} item{project.itemCount === 1 ? '' : 's'}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        disabled={busy || !dirty || !name.trim()}
        onClick={save}
        title="Save changes"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      {canDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
          disabled={busy || project.itemCount > 0}
          onClick={remove}
          title={project.itemCount > 0 ? 'Move its work items first' : 'Delete project'}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

export function ManageProjectsDialog({ canDelete }: { canDelete: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      const data = (await res.json().catch(() => null)) as { projects?: ProjectRow[] } | null
      setProjects(data?.projects ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  function onChanged() {
    load()
    router.refresh()
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (res.ok) {
        setNewName('')
        onChanged()
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(body?.error ?? 'Failed to create project')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderKanban className="mr-1.5 h-3.5 w-3.5" />
        Projects
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Projects</DialogTitle>
          </DialogHeader>
          {loading && projects.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Loading projects…</p>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <ProjectItem key={project.id} project={project} canDelete={canDelete} onChanged={onChanged} />
              ))}
            </div>
          )}
          <form onSubmit={create} className="flex items-center gap-2 border-t pt-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New project name…"
              className="h-8 flex-1 text-sm"
            />
            <Button type="submit" size="sm" className="h-8" disabled={creating || !newName.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {creating ? 'Adding…' : 'Add'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
