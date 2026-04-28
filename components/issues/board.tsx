'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IssuesSyncButton } from '@/components/issues-sync-button'
import { cn } from '@/lib/utils'
import type { IssueBucket } from '@/lib/linear/issue-bucket'

const BUCKET_ORDER: IssueBucket[] = ['todo', 'inProgress', 'completed', 'backlog']
const MAX_VISIBLE_PER_COLUMN = 10

type PriorityValue = 0 | 1 | 2 | 3 | 4
type SortOption = 'default' | 'priorityHighFirst' | 'priorityLowFirst'

const BUCKET_LABELS: Record<IssueBucket, string> = {
  todo: 'Todo',
  inProgress: 'In Progress',
  completed: 'Completed',
  backlog: 'Backlog',
}

const BUCKET_STYLES: Record<IssueBucket, string> = {
  todo: 'border-slate-300/50 dark:border-slate-700/60',
  inProgress: 'border-amber-300/60 dark:border-amber-700/60',
  completed: 'border-emerald-300/60 dark:border-emerald-700/60',
  backlog: 'border-cyan-300/60 dark:border-cyan-700/60',
}

const PRIORITY_LABEL: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
}

const BUCKET_DESCRIPTION: Record<IssueBucket, string> = {
  todo: 'Ready to start',
  inProgress: 'Actively being worked on',
  completed: 'Finished issues',
  backlog: 'Queued for later',
}

const PRIORITY_ORDER: PriorityValue[] = [1, 2, 3, 4, 0]

const PRIORITY_RANK_HIGH_FIRST: Record<PriorityValue, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  0: 4,
}

const PRIORITY_RANK_LOW_FIRST: Record<PriorityValue, number> = {
  4: 0,
  3: 1,
  2: 2,
  1: 3,
  0: 4,
}

export interface IssueBoardItem {
  id: string
  identifier: string
  title: string
  description: string | null
  linearUrl: string | null
  projectName: string | null
  assigneeName: string | null
  priority: number | null
}

interface IssuesBoardProps {
  buckets: Record<IssueBucket, IssueBoardItem[]>
}

function createDefaultVisibility(): Record<IssueBucket, boolean> {
  return {
    todo: true,
    inProgress: true,
    completed: true,
    backlog: true,
  }
}

function createDefaultPriorityVisibility(): Record<PriorityValue, boolean> {
  return {
    0: true,
    1: true,
    2: true,
    3: true,
    4: true,
  }
}

function normalizePriority(value: number | null): PriorityValue {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value
  }
  return 0
}

function sortByPriority(items: IssueBoardItem[], rankMap: Record<PriorityValue, number>): IssueBoardItem[] {
  return [...items].sort((a, b) => {
    const left = rankMap[normalizePriority(a.priority)]
    const right = rankMap[normalizePriority(b.priority)]

    if (left !== right) {
      return left - right
    }
    return a.identifier.localeCompare(b.identifier)
  })
}

export function IssuesBoard({ buckets }: IssuesBoardProps) {
  const filtersContainerRef = useRef<HTMLDivElement | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedIssue, setSelectedIssue] = useState<IssueBoardItem | null>(null)
  const [visibleBuckets, setVisibleBuckets] = useState<Record<IssueBucket, boolean>>(createDefaultVisibility)
  const [visiblePriorities, setVisiblePriorities] = useState<Record<PriorityValue, boolean>>(
    createDefaultPriorityVisibility,
  )
  const [sortBy, setSortBy] = useState<SortOption>('default')

  const hasVisibleColumn = useMemo(() => BUCKET_ORDER.some((bucketKey) => visibleBuckets[bucketKey]), [visibleBuckets])

  const priorityCounts = useMemo(() => {
    const counts: Record<PriorityValue, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
    }

    for (const bucketKey of BUCKET_ORDER) {
      for (const item of buckets[bucketKey]) {
        counts[normalizePriority(item.priority)]++
      }
    }

    return counts
  }, [buckets])

  const filteredBuckets = useMemo(() => {
    const next: Record<IssueBucket, IssueBoardItem[]> = {
      todo: [],
      inProgress: [],
      completed: [],
      backlog: [],
    }

    for (const bucketKey of BUCKET_ORDER) {
      const byPriority = buckets[bucketKey].filter((item) => visiblePriorities[normalizePriority(item.priority)])

      if (sortBy === 'priorityHighFirst') {
        next[bucketKey] = sortByPriority(byPriority, PRIORITY_RANK_HIGH_FIRST)
      } else if (sortBy === 'priorityLowFirst') {
        next[bucketKey] = sortByPriority(byPriority, PRIORITY_RANK_LOW_FIRST)
      } else {
        next[bucketKey] = byPriority
      }
    }

    return next
  }, [buckets, sortBy, visiblePriorities])

  const toggleBucket = (bucketKey: IssueBucket, checked: boolean) => {
    setVisibleBuckets((prev) => ({
      ...prev,
      [bucketKey]: checked,
    }))
  }

  const togglePriority = (priority: PriorityValue, checked: boolean) => {
    setVisiblePriorities((prev) => ({
      ...prev,
      [priority]: checked,
    }))
  }

  const selectedIssuePriority = selectedIssue ? PRIORITY_LABEL[normalizePriority(selectedIssue.priority)] : null

  useEffect(() => {
    if (!showFilters) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (filtersContainerRef.current?.contains(target)) {
        return
      }

      setShowFilters(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowFilters(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showFilters])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div ref={filtersContainerRef} className="relative flex flex-col items-end gap-2">
          <IssuesSyncButton />
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setShowFilters((prev) => !prev)}
            aria-expanded={showFilters}
            aria-controls="issues-filter-panel"
            aria-label="Toggle issue filters"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>

          {showFilters && (
            <Card
              id="issues-filter-panel"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(92vw,500px)] border-border/70 bg-card/95 shadow-2xl backdrop-blur-sm supports-[backdrop-filter]:bg-card/85 animate-in fade-in-0 zoom-in-95"
            >
              <CardContent className="pt-3 pb-3 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Columns</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {BUCKET_ORDER.map((bucketKey) => {
                      const checkboxId = `issues-column-${bucketKey}`
                      return (
                        <label
                          key={bucketKey}
                          htmlFor={checkboxId}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            id={checkboxId}
                            checked={visibleBuckets[bucketKey]}
                            onCheckedChange={(checked) => toggleBucket(bucketKey, checked === true)}
                          />
                          <span>{BUCKET_LABELS[bucketKey]}</span>
                          <span className="text-muted-foreground">({buckets[bucketKey].length})</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priorities</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {PRIORITY_ORDER.map((priority) => {
                      const checkboxId = `issues-priority-${priority}`
                      return (
                        <label
                          key={priority}
                          htmlFor={checkboxId}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            id={checkboxId}
                            checked={visiblePriorities[priority]}
                            onCheckedChange={(checked) => togglePriority(priority, checked === true)}
                          />
                          <span>{PRIORITY_LABEL[priority]}</span>
                          <span className="text-muted-foreground">({priorityCounts[priority]})</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sort</p>
                  <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                    <SelectTrigger size="sm" className="w-[220px]">
                      <SelectValue placeholder="Sort issues" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default order</SelectItem>
                      <SelectItem value="priorityHighFirst">Priority: high to low</SelectItem>
                      <SelectItem value="priorityLowFirst">Priority: low to high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {!hasVisibleColumn ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="font-medium">No columns selected</p>
            <p className="text-sm text-muted-foreground mt-1">Tick at least one column to view issues.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-cols-4 gap-4 min-w-[1120px]">
            {BUCKET_ORDER.map((bucketKey) => {
              if (!visibleBuckets[bucketKey]) {
                return <div key={bucketKey} className="min-h-[520px]" aria-hidden="true" />
              }

              const items = filteredBuckets[bucketKey]

              return (
                <Card key={bucketKey} className={cn('min-h-[520px] flex flex-col', BUCKET_STYLES[bucketKey])}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{BUCKET_LABELS[bucketKey]}</CardTitle>
                      <Badge variant="secondary">{items.length}</Badge>
                    </div>
                    <CardDescription>{BUCKET_DESCRIPTION[bucketKey]}</CardDescription>
                  </CardHeader>

                  <CardContent
                    className="pt-0 overflow-y-auto space-y-3"
                    style={{ maxHeight: `${MAX_VISIBLE_PER_COLUMN * 4.2}rem` }}
                  >
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No issues</p>
                    ) : (
                      items.map((issue) => (
                        <div
                          key={issue.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedIssue(issue)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setSelectedIssue(issue)
                            }
                          }}
                          className="rounded-lg border bg-card p-3 space-y-2 min-h-[4rem] cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] text-muted-foreground font-medium tracking-wide">
                                {issue.identifier}
                              </p>
                              <p className="text-sm font-medium leading-snug line-clamp-2">{issue.title}</p>
                            </div>
                            {issue.linearUrl && (
                              <a
                                href={issue.linearUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            {issue.projectName && <span>{issue.projectName}</span>}
                            {issue.assigneeName && <span>• @{issue.assigneeName}</span>}
                            {issue.priority != null && <span>• {PRIORITY_LABEL[issue.priority] ?? 'Priority'}</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <Dialog open={selectedIssue !== null} onOpenChange={(open) => !open && setSelectedIssue(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedIssue?.identifier}: {selectedIssue?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedIssue?.projectName ?? 'No project'}
              {selectedIssue?.assigneeName ? ` • @${selectedIssue.assigneeName}` : ''}
              {selectedIssuePriority ? ` • ${selectedIssuePriority}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-muted/20 p-4">
            {selectedIssue?.description?.trim() ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{selectedIssue.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No description is available yet for this issue. Sync again if it was recently updated in Linear.
              </p>
            )}
          </div>

          {selectedIssue?.linearUrl && (
            <DialogFooter>
              <Button asChild variant="outline" size="sm">
                <a href={selectedIssue.linearUrl} target="_blank" rel="noopener noreferrer">
                  Open in Linear
                </a>
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
