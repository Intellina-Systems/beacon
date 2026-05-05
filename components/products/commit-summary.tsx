'use client'

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface CommitSummaryProps {
  commits: Array<{
    id: string
    message: string
    authorLogin?: string | null
    committedAt?: Date | null
  }>
  productId: string
  rangeDays: number
  rangeLabel: string
}

type ChangelogEntry = {
  number: number
  title: string
  authorLogin: string | null
  htmlUrl: string
  state: string
  updatedAt: string | null
  mergedAt: string | null
  additions: number
  deletions: number
  changedFiles: number
  summary: {
    briefSummary: string
    whatChanged: string[]
    important: string[]
  }
}

type ChangelogResponse = {
  mode: 'changelog'
  range: { from: string; to: string }
  entries: ChangelogEntry[]
}

export function CommitSummary({ commits, productId, rangeDays, rangeLabel }: CommitSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [changelog, setChangelog] = useState<ChangelogResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'summary' | 'changelog'>('summary')

  const dateRange = useMemo(() => {
    const toDate = new Date()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - rangeDays)

    return {
      from: fromDate,
      to: toDate,
      fromLabel: fromDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      toLabel: toDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }
  }, [rangeDays])

  const modeLabel = mode === 'summary' ? 'Summary' : 'Changelog'

  async function generateSummary() {
    if (mode === 'summary' && commits.length === 0) {
      toast.error('No commits to summarize')
      return
    }

    setSummary(null)
    setChangelog(null)
    setLoading(true)
    try {
      const response = await fetch(`/api/products/${productId}/commits/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commits, mode, since: dateRange.from.toISOString() }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate summary')
      }

      const data = (await response.json()) as { mode: 'summary'; summary: string } | ChangelogResponse

      if (data.mode === 'changelog') {
        setChangelog(data)
      } else {
        setSummary(data.summary)
      }
      setOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }

  const timeframeLabel = `${dateRange.fromLabel} to ${dateRange.toLabel}`
  const metaLine = `Based on ${commits.length} commits • ${timeframeLabel}`
  const changelogMetaLine = changelog
    ? `Based on ${changelog.entries.length} pull requests • ${timeframeLabel}`
    : `Based on 0 pull requests • ${timeframeLabel}`
  const displayRangeLabel = `Showing ${mode} for ${rangeLabel.toLowerCase()}`
  const displayRangeDescription =
    mode === 'summary'
      ? `Showing summary for commits from ${timeframeLabel}`
      : `Showing changelog for PRs from ${timeframeLabel}`

  return (
    <>
      <div className="inline-flex items-center">
        <Button
          size="sm"
          variant="outline"
          onClick={generateSummary}
          disabled={loading || (mode === 'summary' && commits.length === 0)}
          className="rounded-r-none"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Generating…
            </>
          ) : (
            modeLabel
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              className="rounded-l-none px-2"
              aria-label="Select output type"
            >
              v
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Generate</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setMode('summary')
                setOpen(false)
              }}
            >
              Summary
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setMode('changelog')
                setOpen(false)
              }}
            >
              Changelog
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{mode === 'summary' ? 'Commits Summary' : 'Changelog'}</DialogTitle>
            <DialogDescription>{displayRangeDescription}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-2">
            {summary && mode === 'summary' && (
              <div className="space-y-4 py-4">
                <div className="rounded-lg border border-black/20 bg-black/5 p-4 dark:border-white/20 dark:bg-white/5">
                  <p className="text-sm leading-relaxed text-foreground">{summary}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                  {metaLine}
                </div>
              </div>
            )}
            {mode === 'changelog' && (
              <div className="space-y-6 py-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{displayRangeLabel}</p>
                  <p className="text-sm text-muted-foreground">
                    {changelog?.entries.length ? 'Detailed PR breakdown' : 'No pull requests found'}
                  </p>
                </div>

                {changelog?.entries.length ? (
                  <div className="space-y-6">
                    {changelog.entries.map((entry) => {
                      const updatedLabel = entry.mergedAt ?? entry.updatedAt
                      const updatedText = updatedLabel
                        ? new Date(updatedLabel).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Unknown date'

                      return (
                        <div key={`${entry.number}-${entry.htmlUrl}`} className="grid gap-4 md:grid-cols-[120px_1fr]">
                          <div className="text-xs text-muted-foreground md:text-right">{updatedText}</div>
                          <div className="rounded-lg border border-black/20 bg-black/5 p-4 dark:border-white/20 dark:bg-white/5">
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <a
                                  href={entry.htmlUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-semibold text-foreground hover:underline"
                                >
                                  #{entry.number} {entry.title}
                                </a>
                                <div className="text-xs text-muted-foreground">
                                  {entry.authorLogin ? `@${entry.authorLogin}` : 'Unknown author'}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {entry.state}
                                {entry.state ? ' · ' : ''}+{entry.additions} -{entry.deletions} · {entry.changedFiles}{' '}
                                files
                              </div>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              {entry.summary.briefSummary && (
                                <div className="space-y-2 md:col-span-2">
                                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Summary</p>
                                  <p className="text-sm text-foreground">{entry.summary.briefSummary}</p>
                                </div>
                              )}
                              <div className="space-y-2">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">What changed</p>
                                <ul className="list-disc space-y-1 pl-4 text-sm text-foreground">
                                  {entry.summary.whatChanged.length > 0 ? (
                                    entry.summary.whatChanged.map((item) => <li key={item}>{item}</li>)
                                  ) : (
                                    <li>Details unavailable.</li>
                                  )}
                                </ul>
                              </div>
                              <div className="space-y-2">
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Important to know
                                </p>
                                <ul className="list-disc space-y-1 pl-4 text-sm text-foreground">
                                  {entry.summary.important.length > 0 ? (
                                    entry.summary.important.map((item) => <li key={item}>{item}</li>)
                                  ) : (
                                    <li>No additional notes.</li>
                                  )}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                  {changelogMetaLine}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
