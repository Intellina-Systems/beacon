'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Github, LinkIcon, PlugZap, RefreshCw, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type AttachedLinearWorkspace = {
  id: string
  linearWorkspaceId: string
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

type ApiError = {
  error?: string
}

interface ProductSettingsProps {
  productId: string
  linearConnected: boolean
  linearWorkspaceName: string | null
  attachedLinearWorkspace: AttachedLinearWorkspace | null
  githubConnected: boolean
  githubUsername: string | null
  repositories: ProductRepository[]
}

export function ProductSettings({
  productId,
  linearConnected,
  linearWorkspaceName,
  attachedLinearWorkspace,
  githubConnected,
  githubUsername,
  repositories,
}: ProductSettingsProps) {
  const router = useRouter()
  const [repoUrl, setRepoUrl] = useState('')
  const [repoPickerOpen, setRepoPickerOpen] = useState(false)
  const [repoOptions, setRepoOptions] = useState<GitHubRepositoryOption[]>([])
  const [loading, setLoading] = useState<string | null>(null)

  async function getErrorMessage(response: Response, fallback: string) {
    try {
      const data = (await response.json()) as ApiError
      return data.error ?? fallback
    } catch {
      return fallback
    }
  }

  async function attachLinearWorkspace() {
    setLoading('linear')
    try {
      const response = await fetch(`/api/products/${productId}/linear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attach' }),
      })
      if (response.ok) {
        router.refresh()
      }
    } finally {
      setLoading(null)
    }
  }

  async function detachLinearWorkspace(connectionId: string) {
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
      } else {
        toast.error(await getErrorMessage(response, 'Failed to attach GitHub repository'))
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
      } else {
        toast.error(await getErrorMessage(response, 'Failed to load GitHub repositories'))
      }
    } finally {
      setLoading(null)
    }
  }

  async function syncGitHub() {
    setLoading('github-sync')
    try {
      const response = await fetch(`/api/products/${productId}/github/sync`, { method: 'POST' })
      if (response.ok) {
        const data = (await response.json()) as { commitsSynced: number; pullRequestsSynced: number }
        toast.success(`Synced ${data.commitsSynced} commits and ${data.pullRequestsSynced} pull requests.`)
        router.refresh()
      } else {
        toast.error(await getErrorMessage(response, 'Failed to sync GitHub'))
      }
    } finally {
      setLoading(null)
    }
  }

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
              : 'Connect Linear before attaching a workspace.'}
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
              {!attachedLinearWorkspace && (
                <Button onClick={attachLinearWorkspace} disabled={loading === 'linear'}>
                  <PlugZap className="h-4 w-4 mr-2" />
                  Attach Workspace
                </Button>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={syncLinear}
                  disabled={!attachedLinearWorkspace || loading === 'linear-sync'}
                >
                  <RefreshCw className={loading === 'linear-sync' ? 'h-4 w-4 mr-2 animate-spin' : 'h-4 w-4 mr-2'} />
                  Sync Linear
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {!attachedLinearWorkspace ? (
                  <p className="text-sm text-muted-foreground">No Linear workspace attached yet.</p>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{linearWorkspaceName ?? 'Linear workspace'}</p>
                      <p className="text-xs text-muted-foreground">Product workspace</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => detachLinearWorkspace(attachedLinearWorkspace.id)}
                      disabled={loading === attachedLinearWorkspace.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
