'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Github, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RelativeTime } from '@/components/ui/relative-time'

interface SourceRow {
  id: string
  kind: string
  identifier: string
  displayName: string
  enabled: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
  projectId: string | null
}

interface ProjectOption {
  id: string
  name: string
}

const KIND_LABEL: Record<string, string> = {
  github_repo: 'GitHub repo',
}

export function SourcesCard({
  sources,
  projects,
  githubConnected,
}: {
  sources: SourceRow[]
  projects: ProjectOption[]
  githubConnected: boolean
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<'github' | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function syncNow(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/sources/${id}/sync`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Synced — ${data.events} new events`)
        router.refresh()
      } else {
        toast.error(data.error ?? 'Sync failed')
      }
    } finally {
      setBusyId(null)
    }
  }

  async function setProject(id: string, projectId: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectId === 'none' ? null : projectId }),
      })
      if (res.ok) router.refresh()
      else toast.error('Failed to update project')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
      else toast.error('Failed to remove source')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Signal sources</CardTitle>
          <CardDescription>The streams Beacon watches and turns into events.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!githubConnected} onClick={() => setDialog('github')}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Repo
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No sources yet. Add a GitHub repo to start collecting signals.
          </p>
        ) : (
          <div className="divide-y">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center gap-3 py-2.5 text-sm">
                {source.kind === 'github_repo' && <Github className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{source.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABEL[source.kind] ?? source.kind}
                    {source.lastSyncedAt ? (
                      <RelativeTime date={source.lastSyncedAt} prefix=" · synced " />
                    ) : (
                      ' · never synced'
                    )}
                  </p>
                  {source.lastSyncError && <p className="text-xs text-red-500 truncate">{source.lastSyncError}</p>}
                </div>
                {projects.length > 1 && (
                  <Select
                    value={source.projectId ?? 'none'}
                    onValueChange={(value) => setProject(source.id, value)}
                    disabled={busyId === source.id}
                  >
                    <SelectTrigger size="sm" className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">General</SelectItem>
                      {projects
                        .filter((project) => project.name !== 'General')
                        .map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                {!source.enabled && <Badge variant="outline">Paused</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  disabled={busyId === source.id}
                  onClick={() => syncNow(source.id)}
                  title="Sync now"
                >
                  {busyId === source.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  disabled={busyId === source.id}
                  onClick={() => remove(source.id)}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AddGitHubSourceDialog open={dialog === 'github'} onClose={() => setDialog(null)} />
    </Card>
  )
}

function AddGitHubSourceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [repos, setRepos] = useState<{ owner: string; repo: string; repoUrl: string; private: boolean }[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/github/repositories')
      .then((res) => res.json())
      .then((data) => setRepos(data.repositories ?? []))
      .catch(() => toast.error('Failed to load repositories'))
      .finally(() => setLoading(false))
  }, [open])

  async function add() {
    const repo = repos.find((r) => `${r.owner}/${r.repo}` === selected)
    if (!repo) return
    setSaving(true)
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'github_repo',
          identifier: `${repo.owner}/${repo.repo}`,
          displayName: `${repo.owner}/${repo.repo}`,
          url: repo.repoUrl,
        }),
      })
      if (res.ok) {
        toast.success('Source added')
        onClose()
        router.refresh()
      } else {
        toast.error('Failed to add source')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Track a GitHub repository</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading repositories…</p>
        ) : (
          <div className="space-y-4">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a repository…" />
              </SelectTrigger>
              <SelectContent>
                {repos.map((repo) => (
                  <SelectItem key={`${repo.owner}/${repo.repo}`} value={`${repo.owner}/${repo.repo}`}>
                    {repo.owner}/{repo.repo}
                    {repo.private ? ' (private)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={add} disabled={!selected || saving} className="w-full">
              {saving ? 'Adding…' : 'Add source'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
