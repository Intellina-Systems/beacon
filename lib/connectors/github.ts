import { Octokit } from '@octokit/rest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { signalSources, type SignalSource } from '@/lib/db/schema'
import { getGitHubTokenForWorkspace } from '@/lib/github/user-token'
import type { RawEvent } from '@/lib/events/ingest'
import type { SyncResult } from './types'
import { buildCommitEvent, buildPrEvents, type NormalizedCommit, type NormalizedPullRequest } from './github-events'
import { runGithubIngest, emptyGithubSyncKeys, type GithubSyncKeys } from './github-status-effects'

const INITIAL_LOOKBACK_DAYS = 30

// Turn a repo's recent commits and pull requests into normalized events.
// Dedupe is handled downstream via each event's externalId. Event building
// and status-effect logic are shared with the webhook receiver (see
// ./github-events and ./github-status-effects) so the two ingestion paths
// can never drift from each other.
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
  const keys: GithubSyncKeys = emptyGithubSyncKeys()

  const commits = await octokit.paginate(
    octokit.rest.repos.listCommits,
    { owner, repo, since: since.toISOString(), per_page: 100 },
    (response, done) => {
      if (response.data.length < 100) done()
      return response.data
    },
  )

  for (const commit of commits) {
    const normalized: NormalizedCommit = {
      sha: commit.sha,
      message: commit.commit.message,
      authorLogin: commit.author?.login ?? undefined,
      authorName: commit.commit.author?.name ?? undefined,
      url: commit.html_url,
      occurredAt: commit.commit.author?.date ? new Date(commit.commit.author.date) : new Date(),
    }
    const built = buildCommitEvent(normalized, source.identifier)
    rawEvents.push(built.event)

    if (built.key) {
      keys.commitKeys.add(built.key)
      const author = normalized.authorLogin ?? normalized.authorName
      if (author && !keys.actorLoginByKey.has(built.key)) keys.actorLoginByKey.set(built.key, author)
    }
    for (const closingKey of built.closingKeys) keys.closingCommitKeys.add(closingKey)
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
    const normalized: NormalizedPullRequest = {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      url: pr.html_url,
      authorLogin: pr.user?.login ?? undefined,
      headRef: pr.head.ref,
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      closedAt: !pr.merged_at && pr.state === 'closed' && pr.closed_at ? new Date(pr.closed_at) : null,
      reviewRequestedFrom: pr.requested_reviewers?.map((r) => r.login) ?? [],
    }
    const built = buildPrEvents(normalized, source.identifier)
    rawEvents.push(...built.events)

    for (const ref of built.references) {
      if (normalized.authorLogin && !keys.actorLoginByKey.has(ref.key)) {
        keys.actorLoginByKey.set(ref.key, normalized.authorLogin)
      }
      if (normalized.mergedAt && ref.closing) {
        const set = keys.closingMergesByKey.get(ref.key) ?? new Set<number>()
        set.add(pr.number)
        keys.closingMergesByKey.set(ref.key, set)
      }
    }
  }

  const result = await runGithubIngest(workspaceId, rawEvents, keys)

  const now = new Date()
  await db
    .update(signalSources)
    .set({ cursor: { since: now.toISOString() }, lastSyncedAt: now, lastSyncError: null, updatedAt: now })
    .where(eq(signalSources.id, source.id))

  return { events: result.inserted, workItems: 0 }
}
