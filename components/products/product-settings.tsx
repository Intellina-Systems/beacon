'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Github, LinkIcon, RefreshCw, Trash2, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type LinearProjectOption = {
  id: string
  name: string
  teamName: string | null
}

type AttachedLinearProject = {
  id: string
  linearProjectId: string
  linearProjectName: string | null
  linearTeamName: string | null
}

type ProductRepository = {
  id: string
  owner: string
  repo: string
  repoUrl: string
  defaultBranch: string | null
  lastSyncedAt: Date | string | null
}

type GitHubRepositoryOption = {
  owner: string
  repo: string
  repoUrl: string
  defaultBranch: string | null
  private: boolean
}

interface ProductSettingsProps {
  productId: string
  linearConnected: boolean
  linearWorkspaceName: string | null
  availableLinearProjects: LinearProjectOption[]
  attachedLinearProjects: AttachedLinearProject[]
  githubConnected: boolean
  githubUsername: string | null
  repositories: ProductRepository[]
}

export function ProductSettings({
  productId,
  linearConnected,
  linearWorkspaceName,
  availableLinearProjects,
  attachedLinearProjects,
  githubConnected,
  githubUsername,
  repositories,
}: ProductSettingsProps) {
  const router = useRouter()
  const [linearProjectId, setLinearProjectId] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [repoPickerOpen, setRepoPickerOpen] = useState(false)
  const [repoOptions, setRepoOptions] = useState<GitHubRepositoryOption[]>([])
  const [loading, setLoading] = useState<string | null>(null)

  async function attachLinearProject() {
    if (!linearProjectId) return
    setLoading('linear')
    try {
      const response = await fetch(`/api/products/${productId}/linear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attach', linearProjectId }),
      })
      if (response.ok) {
        setLinearProjectId('')
        router.refresh()
      }
    } finally {
      setLoading(null)
    }
  }

  async function detachLinearProject(connectionId: string) {
    setLoading(connectionId)
    try {
      const response = await fetch(`/api/products/${productId}/linear?connectionId=${connectionId}`, {
        method: 'DELETE',
      })
      if (response.ok) router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function syncLinear() {
    setLoading('linear-sync')
    try {
      const response = await fetch(`/api/products/${productId}/linear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      })
      if (response.ok) router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function attachRepository(input: { repoUrl?: string; owner?: string; repo?: string }) {
    setLoading('github')
    try {
      const response = await fetch(`/api/products/${productId}/github/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (response.ok) {
        setRepoUrl('')
        setRepoPickerOpen(false)
        router.refresh()
      }
    } finally {
      setLoading(null)
    }
  }

  async function detachRepository(repositoryId: string) {
    setLoading(repositoryId)
    try {
      const response = await fetch(`/api/products/${productId}/github/repositories?repositoryId=${repositoryId}`, {
        method: 'DELETE',
      })
      if (response.ok) router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function loadRepositoryOptions() {
    setLoading('repo-picker')
    try {
      const response = await fetch('/api/github/repositories')
      if (response.ok) {
        const data = (await response.json()) as { repositories: GitHubRepositoryOption[] }
        setRepoOptions(data.repositories)
        setRepoPickerOpen(true)
      }
    } finally {
      setLoading(null)
    }
  }

  async function syncGitHub() {
    setLoading('github-sync')
    try {
      const response = await fetch(`/api/products/${productId}/github/sync`, { method: 'POST' })
      if (response.ok) router.refresh()
    } finally {
      setLoading(null)
    }
  }

  const attachedLinearIds = new Set(attachedLinearProjects.map((project) => project.linearProjectId))
  const unattachedLinearProjects = availableLinearProjects.filter((project) => !attachedLinearIds.has(project.id))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Linear
          </CardTitle>
          <CardDescription>
            {linearConnected
              ? `Connected to ${linearWorkspaceName ?? 'Linear'}`
              : 'Connect Linear before attaching work projects.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!linearConnected ? (
            <Button asChild>
              <a href="/api/auth/linear/signin">
                <Zap className="h-4 w-4 mr-2" />
                Connect Linear
              </a>
            </Button>
          ) : (
            <>
              <div className="flex gap-2">
                <Select value={linearProjectId} onValueChange={setLinearProjectId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Choose a Linear project" />
                  </SelectTrigger>
                  <SelectContent>
                    {unattachedLinearProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={attachLinearProject} disabled={!linearProjectId || loading === 'linear'}>
                  Attach
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={syncLinear} disabled={loading === 'linear-sync'}>
                  <RefreshCw className={loading === 'linear-sync' ? 'h-4 w-4 mr-2 animate-spin' : 'h-4 w-4 mr-2'} />
                  Sync Linear
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {attachedLinearProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Linear projects attached yet.</p>
                ) : (
                  attachedLinearProjects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {project.linearProjectName ?? project.linearProjectId}
                        </p>
                        {project.linearTeamName && (
                          <p className="text-xs text-muted-foreground">{project.linearTeamName}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => detachLinearProject(project.id)}
                        disabled={loading === project.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Github className="h-4 w-4" />
            GitHub
          </CardTitle>
          <CardDescription>
            {githubConnected
              ? `Connected as ${githubUsername ?? 'GitHub user'}`
              : 'Connect GitHub to import pull requests and commits.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!githubConnected ? (
            <Button asChild>
              <a href={`/api/auth/github/signin?next=/projects/${productId}`}>
                <Github className="h-4 w-4 mr-2" />
                Connect GitHub
              </a>
            </Button>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="repo-url">Repository URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="repo-url"
                    value={repoUrl}
                    onChange={(event) => setRepoUrl(event.target.value)}
                    placeholder="https://github.com/acme/product"
                  />
                  <Button
                    onClick={() => attachRepository({ repoUrl })}
                    disabled={!repoUrl.trim() || loading === 'github'}
                  >
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Attach
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={loadRepositoryOptions} disabled={loading === 'repo-picker'}>
                  Browse Repos
                </Button>
                <Button variant="outline" onClick={syncGitHub} disabled={loading === 'github-sync'}>
                  <RefreshCw className={loading === 'github-sync' ? 'h-4 w-4 mr-2 animate-spin' : 'h-4 w-4 mr-2'} />
                  Sync GitHub
                </Button>
              </div>
              {repoPickerOpen && (
                <div className="max-h-56 overflow-auto rounded-md border">
                  {repoOptions.map((repository) => (
                    <button
                      key={`${repository.owner}/${repository.repo}`}
                      type="button"
                      onClick={() => attachRepository({ owner: repository.owner, repo: repository.repo })}
                      className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                    >
                      <span className="truncate">
                        {repository.owner}/{repository.repo}
                      </span>
                      {repository.private && <Badge variant="secondary">Private</Badge>}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {repositories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No GitHub repositories attached yet.</p>
                ) : (
                  repositories.map((repository) => (
                    <div
                      key={repository.id}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {repository.owner}/{repository.repo}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {repository.defaultBranch ? `Default: ${repository.defaultBranch}` : 'Default branch unknown'}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => detachRepository(repository.id)}
                        disabled={loading === repository.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
