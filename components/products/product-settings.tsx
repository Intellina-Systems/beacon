'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Github, Loader2, LinkIcon, PlugZap, RefreshCw, Search, Trash2, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  pullRequestCount: number
  commitCount: number
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

type SyncPhase = 'fetching_prs' | 'fetching_commits'

type SyncLogEntry = {
  owner: string
  repo: string
  status: 'syncing' | 'done' | 'error'
  phase?: SyncPhase
  prsFetched?: number
  prPage?: number
  commitsFetched?: number
  commitPage?: number
  pullRequestsSynced?: number
  commitsSynced?: number
  linksCreated?: number
  message?: string
}

type SyncTotals = {
  repositoriesSynced: number
  pullRequestsSynced: number
  commitsSynced: number
  linksCreated: number
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

const REPO_PAGE_SIZE = 20

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return 'Never synced'
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
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
  const [repoSearch, setRepoSearch] = useState('')
  const [repoPickerPage, setRepoPickerPage] = useState(1)
  const [loading, setLoading] = useState<string | null>(null)

  const [syncDays, setSyncDays] = useState('90')
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([])
  const [syncTotals, setSyncTotals] = useState<SyncTotals | null>(null)

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
      if (response.ok) router.refresh()
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
        setRepoSearch('')
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
        setRepoSearch('')
        setRepoPickerPage(1)
        setRepoPickerOpen(true)
      } else {
        toast.error(await getErrorMessage(response, 'Failed to load GitHub repositories'))
      }
    } finally {
      setLoading(null)
    }
  }

  async function syncGitHub() {
    if (repositories.length === 0) {
      toast.error('No repositories attached. Add a repository first.')
      return
    }

    setSyncState('syncing')
    setSyncLog([])
    setSyncTotals(null)

    try {
      const since = new Date()
      since.setDate(since.getDate() - parseInt(syncDays, 10))

      const response = await fetch(`/api/products/${productId}/github/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: since.toISOString() }),
      })

      if (!response.ok || !response.body) {
        const msg = await getErrorMessage(response, 'Sync failed')
        toast.error(msg)
        setSyncState('error')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const lines = part.split('\n')
          let event = ''
          let data = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            else if (line.startsWith('data: ')) data = line.slice(6).trim()
          }
          if (!event || !data) continue

          if (event === 'repo_start') {
            const payload = JSON.parse(data) as { owner: string; repo: string }
            setSyncLog((prev) => [...prev, { owner: payload.owner, repo: payload.repo, status: 'syncing' }])
          } else if (event === 'repo_progress') {
            const payload = JSON.parse(data) as {
              owner: string
              repo: string
              phase: SyncPhase
              page: number
              fetched: number
            }
            setSyncLog((prev) =>
              prev.map((entry) => {
                if (entry.owner !== payload.owner || entry.repo !== payload.repo) return entry
                if (payload.phase === 'fetching_prs') {
                  return { ...entry, phase: payload.phase, prPage: payload.page, prsFetched: payload.fetched }
                }
                return { ...entry, phase: payload.phase, commitPage: payload.page, commitsFetched: payload.fetched }
              }),
            )
          } else if (event === 'repo_done') {
            const payload = JSON.parse(data) as {
              owner: string
              repo: string
              pullRequestsSynced: number
              commitsSynced: number
              linksCreated: number
            }
            setSyncLog((prev) =>
              prev.map((entry) =>
                entry.owner === payload.owner && entry.repo === payload.repo
                  ? { ...entry, status: 'done', phase: undefined, ...payload }
                  : entry,
              ),
            )
          } else if (event === 'repo_error') {
            const payload = JSON.parse(data) as { owner: string; repo: string; message: string }
            setSyncLog((prev) =>
              prev.map((entry) =>
                entry.owner === payload.owner && entry.repo === payload.repo
                  ? { ...entry, status: 'error', phase: undefined, message: payload.message }
                  : entry,
              ),
            )
          } else if (event === 'done') {
            const totals = JSON.parse(data) as SyncTotals
            setSyncTotals(totals)
            setSyncState('done')
            router.refresh()
          } else if (event === 'error') {
            const payload = JSON.parse(data) as { message: string }
            toast.error(payload.message)
            setSyncState('error')
          }
        }
      }
    } catch {
      toast.error('Sync failed unexpectedly')
      setSyncState('error')
    }
  }

  const attachedOwnerRepos = new Set(repositories.map((r) => `${r.owner}/${r.repo}`))
  const filteredRepoOptions = repoOptions.filter((r) => {
    const fullName = `${r.owner}/${r.repo}`.toLowerCase()
    return fullName.includes(repoSearch.toLowerCase())
  })
  const visibleRepoOptions = filteredRepoOptions.slice(0, repoPickerPage * REPO_PAGE_SIZE)
  const hasMoreRepos = visibleRepoOptions.length < filteredRepoOptions.length

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
        <CardContent className="flex flex-col gap-5">
          {!githubConnected ? (
            <Button asChild>
              <a href={`/api/auth/github/signin?next=/projects/${productId}`}>
                <Github className="h-4 w-4 mr-2" />
                Connect GitHub
              </a>
            </Button>
          ) : (
            <>
              {/* Attach repository — hidden once one is attached */}
              {repositories.length === 0 && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="repo-url">Attach repository</Label>
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
                  <Button
                    variant="outline"
                    className="w-fit"
                    onClick={repoPickerOpen ? () => setRepoPickerOpen(false) : loadRepositoryOptions}
                    disabled={loading === 'repo-picker'}
                  >
                    {loading === 'repo-picker' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Github className="h-4 w-4 mr-2" />
                    )}
                    {repoPickerOpen ? 'Close picker' : 'Browse repos'}
                  </Button>
                </div>
              )}

              {/* Repo picker */}
              {repositories.length === 0 && repoPickerOpen && (
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 h-8 text-sm"
                      placeholder="Search repos…"
                      value={repoSearch}
                      onChange={(e) => {
                        setRepoSearch(e.target.value)
                        setRepoPickerPage(1)
                      }}
                    />
                    {repoSearch && (
                      <button
                        type="button"
                        onClick={() => setRepoSearch('')}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-52 overflow-auto rounded-md border">
                    {visibleRepoOptions.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground text-center">No repos found</p>
                    ) : (
                      visibleRepoOptions.map((repository) => {
                        const fullName = `${repository.owner}/${repository.repo}`
                        const alreadyAttached = attachedOwnerRepos.has(fullName)
                        return (
                          <button
                            key={fullName}
                            type="button"
                            onClick={() => !alreadyAttached && attachRepository({ owner: repository.owner, repo: repository.repo })}
                            disabled={alreadyAttached || loading === 'github'}
                            className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent disabled:opacity-50 disabled:cursor-default"
                          >
                            <span className="truncate">{fullName}</span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {repository.private && <Badge variant="secondary">Private</Badge>}
                              {alreadyAttached && <Badge variant="outline">Attached</Badge>}
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                  {hasMoreRepos && (
                    <button
                      type="button"
                      onClick={() => setRepoPickerPage((p) => p + 1)}
                      className="text-xs text-muted-foreground hover:text-foreground py-1"
                    >
                      Show more ({filteredRepoOptions.length - visibleRepoOptions.length} remaining)
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {repoSearch
                      ? `${filteredRepoOptions.length} of ${repoOptions.length} repos`
                      : `${repoOptions.length} repos`}
                  </p>
                </div>
              )}

              {/* Sync controls */}
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">Sync options</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground shrink-0">Since</span>
                    <Select value={syncDays} onValueChange={setSyncDays}>
                      <SelectTrigger className="h-8 w-36 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                        <SelectItem value="365">Last year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    onClick={syncGitHub}
                    disabled={syncState === 'syncing' || repositories.length === 0}
                  >
                    <RefreshCw className={syncState === 'syncing' ? 'h-4 w-4 mr-2 animate-spin' : 'h-4 w-4 mr-2'} />
                    {syncState === 'syncing' ? 'Syncing…' : 'Sync GitHub'}
                  </Button>
                </div>
              </div>

              {/* Sync progress log */}
              {syncLog.length > 0 && (
                <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {syncState === 'syncing' ? 'Syncing…' : syncState === 'done' ? 'Sync complete' : 'Sync stopped'}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {syncLog.map((entry, i) => (
                      <div key={i} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          {entry.status === 'syncing' && (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                          )}
                          {entry.status === 'done' && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                          )}
                          {entry.status === 'error' && (
                            <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
                          )}
                          <span className="font-mono text-xs font-medium">
                            {entry.owner}/{entry.repo}
                          </span>
                          {entry.status === 'done' && (
                            <span className="text-xs text-muted-foreground">
                              {entry.pullRequestsSynced} PRs · {entry.commitsSynced} commits
                              {(entry.linksCreated ?? 0) > 0 && ` · ${entry.linksCreated} links`}
                            </span>
                          )}
                          {entry.status === 'error' && (
                            <span className="text-xs text-destructive">{entry.message}</span>
                          )}
                        </div>
                        {entry.status === 'syncing' && (
                          <div className="ml-5 text-xs text-muted-foreground space-y-0.5">
                            {!entry.phase && <span>Starting…</span>}
                            {entry.phase === 'fetching_prs' && (
                              <span>
                                Fetching pull requests — {entry.prsFetched} found
                                {(entry.prPage ?? 0) > 1 && ` across ${entry.prPage} pages`}
                              </span>
                            )}
                            {entry.phase === 'fetching_commits' && (
                              <>
                                {entry.prsFetched !== undefined && (
                                  <div className="text-muted-foreground/70">
                                    ✓ PRs done ({entry.prsFetched} scanned)
                                  </div>
                                )}
                                <span>
                                  Fetching commits — {entry.commitsFetched} found
                                  {(entry.commitPage ?? 0) > 1 && ` across ${entry.commitPage} pages`}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {syncTotals && (
                    <p className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                      {syncTotals.pullRequestsSynced} PRs and {syncTotals.commitsSynced} commits across{' '}
                      {syncTotals.repositoriesSynced} repo{syncTotals.repositoriesSynced !== 1 ? 's' : ''}
                      {syncTotals.linksCreated > 0 && ` · ${syncTotals.linksCreated} new Linear links`}
                    </p>
                  )}
                </div>
              )}

              {/* Attached repositories */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {repositories.length === 0 ? 'No repositories attached' : `${repositories.length} attached`}
                </p>
                {repositories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Add a repository URL above or browse your repos to attach one.
                  </p>
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
                          {repository.defaultBranch ?? 'unknown branch'}
                          {' · '}
                          {repository.pullRequestCount} PRs · {repository.commitCount} commits
                          {' · '}
                          {formatRelativeTime(repository.lastSyncedAt)}
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
