import type { RawEvent } from '@/lib/events/ingest'
import { parseGitReferences, type GitReference } from '@/lib/work-items/git-references'

// Normalized shapes so both the REST polling path (lib/connectors/github.ts)
// and the webhook path (app/api/webhooks/github/route.ts) build identical
// events from their differently-shaped API payloads.

export interface NormalizedCommit {
  sha: string
  message: string
  authorLogin?: string
  authorName?: string
  url: string
  occurredAt: Date
}

export interface NormalizedPullRequest {
  number: number
  title: string
  body: string | null
  url: string
  authorLogin?: string
  headRef: string
  createdAt: Date
  updatedAt: Date
  mergedAt: Date | null
  // Only set when the PR is closed WITHOUT having merged.
  closedAt: Date | null
  reviewRequestedFrom: string[]
}

export interface BuiltCommitEvent {
  event: RawEvent
  key?: string
  closingKeys: string[]
}

// A commit message can mention several keys ("cleanup, fixes BEA-9"); the
// event itself can only correlate to one work item (RawEvent.task is
// singular), so a closing reference wins over a bare one, and the first
// reference otherwise — same one-key-per-commit shape the old bare-key
// extraction had. closingKeys carries every closing reference found,
// independent of which one became the event's primary task, so the status-
// effects pass can complete every item a commit closes, not just the first.
export function buildCommitEvent(commit: NormalizedCommit, repoIdentifier: string): BuiltCommitEvent {
  const references = parseGitReferences(commit.message)
  const primary = references.find((r) => r.closing) ?? references[0]
  const author = commit.authorLogin ?? commit.authorName
  const firstLine = commit.message.split('\n')[0]

  const event: RawEvent = {
    type: 'code.commit',
    source: 'github',
    summary: `${author ?? 'someone'} committed to ${repoIdentifier}: ${firstLine}`,
    engineer: author,
    task: primary?.key,
    externalId: `commit:${repoIdentifier}:${commit.sha}`,
    occurredAt: commit.occurredAt,
    payload: { sha: commit.sha, repo: repoIdentifier, url: commit.url, message: firstLine },
  }

  return {
    event,
    key: primary?.key,
    closingKeys: references.filter((r) => r.closing).map((r) => r.key),
  }
}

export interface BuiltPrEvents {
  events: RawEvent[]
  references: GitReference[]
}

export function buildPrEvents(pr: NormalizedPullRequest, repoIdentifier: string): BuiltPrEvents {
  // Title + body carry the English magic words ("Fixes BEA-1"); the branch
  // name can too (e.g. "fix/bea-4-login-bug"), so it's parsed the same way,
  // not just bare-key-matched.
  const references = parseGitReferences(`${pr.title}\n${pr.body ?? ''}`)
  for (const ref of parseGitReferences(pr.headRef)) {
    if (!references.some((r) => r.key === ref.key)) references.push(ref)
  }

  // No reference at all: still record the PR's activity (unlinked), same as
  // the original bare-key-only behavior.
  const targets: (GitReference | { key: undefined; closing: false })[] =
    references.length > 0 ? references : [{ key: undefined, closing: false }]

  const events: RawEvent[] = []
  for (const ref of targets) {
    const keySuffix = ref.key ? `:${ref.key}` : ''
    const base = {
      source: 'github' as const,
      engineer: pr.authorLogin,
      task: ref.key,
      payload: {
        number: pr.number,
        repo: repoIdentifier,
        url: pr.url,
        title: pr.title,
        closing: ref.closing,
      },
    }

    events.push({
      ...base,
      type: 'pr.opened',
      summary: `${pr.authorLogin ?? 'someone'} opened PR #${pr.number} in ${repoIdentifier}: ${pr.title}`,
      externalId: `pr:${repoIdentifier}:${pr.number}:opened${keySuffix}`,
      occurredAt: pr.createdAt,
    })

    if (pr.mergedAt) {
      events.push({
        ...base,
        type: 'pr.merged',
        summary: `PR #${pr.number} merged in ${repoIdentifier}: ${pr.title}`,
        externalId: `pr:${repoIdentifier}:${pr.number}:merged${keySuffix}`,
        occurredAt: pr.mergedAt,
      })
    } else if (pr.closedAt) {
      events.push({
        ...base,
        type: 'pr.closed',
        summary: `PR #${pr.number} closed without merge in ${repoIdentifier}: ${pr.title}`,
        externalId: `pr:${repoIdentifier}:${pr.number}:closed${keySuffix}`,
        occurredAt: pr.closedAt,
      })
    } else if (pr.reviewRequestedFrom.length > 0) {
      events.push({
        ...base,
        type: 'pr.review_requested',
        summary: `PR #${pr.number} awaiting review from ${pr.reviewRequestedFrom.join(', ')}: ${pr.title}`,
        externalId: `pr:${repoIdentifier}:${pr.number}:review:${[...pr.reviewRequestedFrom].sort().join(',')}${keySuffix}`,
        occurredAt: pr.updatedAt,
        payload: { ...base.payload, reviewers: pr.reviewRequestedFrom },
      })
    }
  }

  return { events, references }
}
