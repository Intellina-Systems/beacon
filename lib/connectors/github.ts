import { Octokit } from '@octokit/rest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { signalSources, type SignalSource } from '@/lib/db/schema'
import { getGitHubTokenForWorkspace } from '@/lib/github/user-token'
import { ingestEvents, type RawEvent } from '@/lib/events/ingest'
import { extractWorkItemKey, type SyncResult } from './types'

const INITIAL_LOOKBACK_DAYS = 30

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
    rawEvents.push({
      type: 'code.commit',
      source: 'github',
      summary: `${author ?? 'someone'} committed to ${source.identifier}: ${message}`,
      engineer: author,
      task: extractWorkItemKey(commit.commit.message),
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
    const task = extractWorkItemKey(pr.title, pr.head.ref, pr.body)
    const base = {
      source: 'github' as const,
      engineer: pr.user?.login,
      task,
      payload: { number: pr.number, repo: source.identifier, url: pr.html_url, title: pr.title },
    }

    rawEvents.push({
      ...base,
      type: 'pr.opened',
      summary: `${pr.user?.login ?? 'someone'} opened PR #${pr.number} in ${source.identifier}: ${pr.title}`,
      externalId: `pr:${source.identifier}:${pr.number}:opened`,
      occurredAt: new Date(pr.created_at),
    })

    if (pr.merged_at) {
      rawEvents.push({
        ...base,
        type: 'pr.merged',
        summary: `PR #${pr.number} merged in ${source.identifier}: ${pr.title}`,
        externalId: `pr:${source.identifier}:${pr.number}:merged`,
        occurredAt: new Date(pr.merged_at),
      })
    } else if (pr.state === 'closed' && pr.closed_at) {
      rawEvents.push({
        ...base,
        type: 'pr.closed',
        summary: `PR #${pr.number} closed without merge in ${source.identifier}: ${pr.title}`,
        externalId: `pr:${source.identifier}:${pr.number}:closed`,
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
          .join(',')}`,
        occurredAt: new Date(pr.updated_at),
        payload: { ...base.payload, reviewers: pr.requested_reviewers.map((r) => r.login) },
      })
    }
  }

  const result = await ingestEvents(rawEvents, { workspaceId, defaultSource: 'github' })

  const now = new Date()
  await db
    .update(signalSources)
    .set({ cursor: { since: now.toISOString() }, lastSyncedAt: now, lastSyncError: null, updatedAt: now })
    .where(eq(signalSources.id, source.id))

  return { events: result.inserted, workItems: 0 }
}
