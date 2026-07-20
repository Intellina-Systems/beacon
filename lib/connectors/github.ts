import { Octokit } from '@octokit/rest'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { signalSources, workItems, type SignalSource } from '@/lib/db/schema'
import { getGitHubTokenForWorkspace } from '@/lib/github/user-token'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'
import { extractWorkItemKey, type SyncResult } from './types'
import { parseGitReferences, type GitReference } from '@/lib/work-items/git-references'
import { allClosingPRsResolved } from '@/lib/work-items/git-status'

const INITIAL_LOOKBACK_DAYS = 30
// Statuses a commit is allowed to bump straight to in_progress. Anything
// further along (in review, blocked, done…) is left alone.
const IN_PROGRESS_ELIGIBLE_STATUSES = new Set(['triage', 'backlog', 'todo'])

// Turn a repo's recent commits and pull requests into normalized events.
// Dedupe is handled downstream via each event's externalId.
export async function syncGitHubSource(workspaceId: string, source: SignalSource): Promise<SyncResult> {
  const token = await getGitHubTokenForWorkspace(workspaceId)
  if (!token) throw new Error('GitHub is not connected')

  const [owner, repo] = source.identifier.split('/')
  if (!owner || !repo) throw new Error(`Invalid repository identifier: ${source.identifier}`)

  const octokit = new Octokit({ auth: token })
  const cursor = (source.cursor ?? {}) as { since?: string }
  const since = cursor.since
    ? new Date(cursor.since)
    : new Date(Date.now() - INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  const rawEvents: RawEvent[] = []
  const commitKeys = new Set<string>()
  const prKeys = new Set<string>()
  // key -> PR numbers that merged with a closing keyword ("fixes/closes…"),
  // checked against ALL of an item's linked PRs after ingest — "last linked
  // PR wins": the item only completes once none remain unresolved.
  const closingMergesByKey = new Map<string, Set<number>>()

  const commits = await octokit.paginate(
    octokit.rest.repos.listCommits,
    { owner, repo, since: since.toISOString(), per_page: 100 },
    (response, done) => {
      if (response.data.length < 100) done()
      return response.data
    },
  )

  for (const commit of commits) {
    const message = commit.commit.message.split('\n')[0]
    const author = commit.author?.login ?? commit.commit.author?.name ?? undefined
    const key = extractWorkItemKey(commit.commit.message)
    if (key) commitKeys.add(key)
    rawEvents.push({
      type: 'code.commit',
      source: 'github',
      summary: `${author ?? 'someone'} committed to ${source.identifier}: ${message}`,
      engineer: author,
      task: key,
      externalId: `commit:${source.identifier}:${commit.sha}`,
      occurredAt: commit.commit.author?.date ? new Date(commit.commit.author.date) : new Date(),
      payload: { sha: commit.sha, repo: source.identifier, url: commit.html_url, message },
    })
  }

  const pulls = await octokit.paginate(
    octokit.rest.pulls.list,
    { owner, repo, state: 'all', sort: 'updated', direction: 'desc', per_page: 100 },
    (response, done) => {
      const fresh = response.data.filter((pr) => new Date(pr.updated_at) >= since)
      if (fresh.length < response.data.length) done()
      return fresh
    },
  )

  for (const pr of pulls) {
    // Title + body carry the English magic words ("Fixes BEA-1"); the branch
    // name never does, so a bare key there is always link-only.
    const references = parseGitReferences(`${pr.title}\n${pr.body ?? ''}`)
    const branchKey = extractWorkItemKey(pr.head.ref)
    if (branchKey && !references.some((r) => r.key === branchKey)) {
      references.push({ key: branchKey, closing: false })
    }
    for (const ref of references) prKeys.add(ref.key)

    // No reference at all: still record the PR's activity (unlinked), same
    // as before — one event with no task.
    const targets: (GitReference | { key: undefined; closing: false })[] =
      references.length > 0 ? references : [{ key: undefined, closing: false }]

    for (const ref of targets) {
      const keySuffix = ref.key ? `:${ref.key}` : ''
      const base = {
        source: 'github' as const,
        engineer: pr.user?.login,
        task: ref.key,
        payload: {
          number: pr.number,
          repo: source.identifier,
          url: pr.html_url,
          title: pr.title,
          closing: ref.closing,
        },
      }

      rawEvents.push({
        ...base,
        type: 'pr.opened',
        summary: `${pr.user?.login ?? 'someone'} opened PR #${pr.number} in ${source.identifier}: ${pr.title}`,
        externalId: `pr:${source.identifier}:${pr.number}:opened${keySuffix}`,
        occurredAt: new Date(pr.created_at),
      })

      if (pr.merged_at) {
        rawEvents.push({
          ...base,
          type: 'pr.merged',
          summary: `PR #${pr.number} merged in ${source.identifier}: ${pr.title}`,
          externalId: `pr:${source.identifier}:${pr.number}:merged${keySuffix}`,
          occurredAt: new Date(pr.merged_at),
        })
        if (ref.key && ref.closing) {
          const set = closingMergesByKey.get(ref.key) ?? new Set<number>()
          set.add(pr.number)
          closingMergesByKey.set(ref.key, set)
        }
      } else if (pr.state === 'closed' && pr.closed_at) {
        rawEvents.push({
          ...base,
          type: 'pr.closed',
          summary: `PR #${pr.number} closed without merge in ${source.identifier}: ${pr.title}`,
          externalId: `pr:${source.identifier}:${pr.number}:closed${keySuffix}`,
          occurredAt: new Date(pr.closed_at),
        })
      } else if (pr.requested_reviewers?.length) {
        rawEvents.push({
          ...base,
          type: 'pr.review_requested',
          summary: `PR #${pr.number} awaiting review from ${pr.requested_reviewers.map((r) => r.login).join(', ')}: ${pr.title}`,
          externalId: `pr:${source.identifier}:${pr.number}:review:${pr.requested_reviewers
            .map((r) => r.login)
            .sort()
            .join(',')}${keySuffix}`,
          occurredAt: new Date(pr.updated_at),
          payload: { ...base.payload, reviewers: pr.requested_reviewers.map((r) => r.login) },
        })
      }
    }
  }

  // Resolve every referenced key once, up front, for the two status-transition
  // passes below (commit -> in_progress, and merge -> done gating).
  const allKeys = Array.from(new Set([...commitKeys, ...prKeys]))
  const existingItems = allKeys.length
    ? await db
        .select({ id: workItems.id, key: workItems.key, status: workItems.status })
        .from(workItems)
        .where(and(eq(workItems.workspaceId, workspaceId), inArray(workItems.key, allKeys)))
    : []
  const itemByKey = new Map(existingItems.filter((item) => item.key).map((item) => [item.key as string, item]))

  // Commits are the closest signal a polling connector has to "branch
  // pushed" (no push-webhook or branch API polling here): the first commit
  // against a still-unstarted item nudges it into progress, mirroring
  // Linear's "branch pushed -> In Progress" rule.
  for (const key of commitKeys) {
    const item = itemByKey.get(key)
    if (item && IN_PROGRESS_ELIGIBLE_STATUSES.has(item.status)) {
      rawEvents.push({
        type: 'task.status_changed',
        source: 'github',
        summary: `${item.key} moved to in progress — commit pushed`,
        task: item.id,
        externalId: `workitem:${item.id}:auto-in-progress`,
        payload: { status: 'in_progress', previousStatus: item.status, reason: 'commit pushed' },
      })
    }
  }

  const result = await ingestEvents(rawEvents, { workspaceId, defaultSource: 'github' })
  let totalInserted = result.inserted

  // Second pass: now that this sync's pr.merged events are in the event
  // store, check whether every closing-linked PR for each affected item has
  // been resolved. Only then does the item complete.
  const completionEvents: RawEvent[] = []
  for (const key of closingMergesByKey.keys()) {
    const item = itemByKey.get(key)
    if (!item) continue
    if (await allClosingPRsResolved(workspaceId, item.id)) {
      completionEvents.push({
        type: 'task.status_changed',
        source: 'github',
        summary: `${item.key} completed — all linked PRs merged`,
        task: item.id,
        externalId: `workitem:${item.id}:completed-by-pr-merge`,
        payload: { status: 'done', reason: 'all linked closing PRs merged' },
      })
    }
  }
  if (completionEvents.length > 0) {
    const completionResult = await ingestEvents(completionEvents, { workspaceId, defaultSource: 'github' })
    totalInserted += completionResult.inserted
  }

  const now = new Date()
  await db
    .update(signalSources)
    .set({ cursor: { since: now.toISOString() }, lastSyncedAt: now, lastSyncError: null, updatedAt: now })
    .where(eq(signalSources.id, source.id))

  return { events: totalInserted, workItems: 0 }
}
