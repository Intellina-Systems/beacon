import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { signalSources } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { verifyGitHubSignature, type GithubWebhookConfig } from '@/lib/github/webhook-signature'
import type { RawEvent } from '@/lib/events/ingest'
import {
  buildCommitEvent,
  buildPrEvents,
  type NormalizedCommit,
  type NormalizedPullRequest,
} from '@/lib/connectors/github-events'
import { runGithubIngest, emptyGithubSyncKeys } from '@/lib/connectors/github-status-effects'
import { syncInboundIssueComment, syncInboundIssueState } from '@/lib/github/issue-sync'

interface WebhookPushCommit {
  id: string
  message: string
  timestamp: string
  url: string
  author?: { name?: string; username?: string }
}

interface WebhookPushPayload {
  repository?: { full_name?: string }
  commits?: WebhookPushCommit[]
}

interface WebhookPullRequestPayload {
  repository?: { full_name?: string }
  pull_request?: {
    number: number
    title: string
    body: string | null
    html_url: string
    user: { login: string } | null
    head: { ref: string }
    created_at: string
    updated_at: string
    merged_at: string | null
    closed_at: string | null
    state: string
    requested_reviewers?: { login: string }[]
  }
}

interface WebhookIssuesPayload {
  action?: string
  repository?: { full_name?: string }
  issue?: {
    number: number
    updated_at: string
    // Present (non-null) when GitHub fires this for a PR, not a genuine
    // Issue — every pull request is also an "issue" under the hood.
    pull_request?: unknown
  }
}

interface WebhookIssueCommentPayload {
  action?: string
  repository?: { full_name?: string }
  issue?: { number: number; pull_request?: unknown }
  comment?: { id: number; body: string; user: { login: string } | null }
}

// No session auth here — GitHub calls this endpoint unauthenticated to us.
// Authenticity is the per-source HMAC signature (verifyGitHubSignature),
// the same role CRON_SECRET plays for /api/cron/*, just GitHub's own scheme.
// Fast path only: the hourly cron sync stays as the reconciliation backstop,
// and shares the same event builders + status-effect pipeline (see
// lib/connectors/github-events.ts, lib/connectors/github-status-effects.ts)
// so a missed or duplicated delivery here is never a correctness problem —
// ingestEvents dedupes by externalId regardless of which path produced it.
export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text()
  const githubEvent = req.headers.get('x-github-event')
  const signature = req.headers.get('x-hub-signature-256')

  let payload: { repository?: { full_name?: string } }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const repoFullName = payload.repository?.full_name
  if (!repoFullName) return Response.json({ error: 'Missing repository' }, { status: 400 })

  // A repo could in principle be connected as a signal source in more than
  // one workspace — try every candidate's secret rather than assuming one.
  const candidates = await db
    .select()
    .from(signalSources)
    .where(and(eq(signalSources.kind, 'github_repo'), eq(signalSources.identifier, repoFullName)))

  let workspaceId: string | null = null
  for (const source of candidates) {
    const config = source.config as GithubWebhookConfig | null
    if (!config?.webhookSecret) continue
    let secret: string
    try {
      secret = decrypt(config.webhookSecret)
    } catch {
      continue
    }
    if (verifyGitHubSignature(rawBody, signature, secret)) {
      workspaceId = source.workspaceId
      break
    }
  }

  if (!workspaceId) return Response.json({ error: 'Signature verification failed' }, { status: 401 })

  // GitHub's post-registration handshake — no event to process.
  if (githubEvent === 'ping') return Response.json({ ok: true })

  const rawEvents: RawEvent[] = []
  const keys = emptyGithubSyncKeys()

  if (githubEvent === 'push') {
    const push = payload as WebhookPushPayload
    for (const commit of push.commits ?? []) {
      const normalized: NormalizedCommit = {
        sha: commit.id,
        message: commit.message,
        authorLogin: commit.author?.username,
        authorName: commit.author?.name,
        url: commit.url,
        occurredAt: new Date(commit.timestamp),
      }
      const built = buildCommitEvent(normalized, repoFullName)
      rawEvents.push(built.event)
      if (built.key) {
        keys.commitKeys.add(built.key)
        const author = normalized.authorLogin ?? normalized.authorName
        if (author && !keys.actorLoginByKey.has(built.key)) keys.actorLoginByKey.set(built.key, author)
      }
      for (const closingKey of built.closingKeys) keys.closingCommitKeys.add(closingKey)
    }
  } else if (githubEvent === 'pull_request') {
    // No action allowlist: every delivery (opened, edited, synchronize,
    // review_requested, closed…) is cheap to reprocess from the payload's
    // current state, and externalId dedup makes a redundant recompute a
    // no-op — simpler and more correct than guessing which actions matter
    // (e.g. an edited title adding a magic word isn't a "closed" action).
    const pr = (payload as WebhookPullRequestPayload).pull_request
    if (pr) {
      const normalized: NormalizedPullRequest = {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        url: pr.html_url,
        authorLogin: pr.user?.login,
        headRef: pr.head.ref,
        createdAt: new Date(pr.created_at),
        updatedAt: new Date(pr.updated_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        closedAt: !pr.merged_at && pr.state === 'closed' && pr.closed_at ? new Date(pr.closed_at) : null,
        reviewRequestedFrom: pr.requested_reviewers?.map((r) => r.login) ?? [],
      }
      const built = buildPrEvents(normalized, repoFullName)
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
  } else if (githubEvent === 'issues') {
    const issuesPayload = payload as WebhookIssuesPayload
    const issue = issuesPayload.issue
    if (issue && (issuesPayload.action === 'closed' || issuesPayload.action === 'reopened')) {
      await syncInboundIssueState(
        workspaceId,
        repoFullName,
        issue.number,
        issuesPayload.action === 'closed' ? 'closed' : 'open',
        issue.updated_at,
      )
    }
  } else if (githubEvent === 'issue_comment') {
    const commentPayload = payload as WebhookIssueCommentPayload
    const issue = commentPayload.issue
    const comment = commentPayload.comment
    // Same webhook event fires for PR comments too (a PR is an Issue under
    // the hood) — issue.pull_request is only present in that case.
    if (issue && comment && !issue.pull_request && commentPayload.action === 'created') {
      await syncInboundIssueComment(workspaceId, repoFullName, issue.number, comment)
    }
  }

  if (rawEvents.length > 0) {
    await runGithubIngest(workspaceId, rawEvents, keys)
  }

  return Response.json({ ok: true })
}
