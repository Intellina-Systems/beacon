import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, workItems } from '@/lib/db/schema'
import { ingestEvents, resolveMember, type RawEvent } from '@/lib/events/ingest'
import { allClosingPRsResolved } from '@/lib/work-items/git-status'

// Statuses a commit is allowed to bump straight to in_progress. Anything
// further along (in review, blocked, done…) is left alone.
const IN_PROGRESS_ELIGIBLE_STATUSES = new Set(['triage', 'backlog', 'todo'])

export interface GithubSyncKeys {
  /** Keys touched by a commit — drives the in_progress bump. */
  commitKeys: Set<string>
  /** Keys with a closing keyword in a commit message on the default branch — complete immediately, no gating. */
  closingCommitKeys: Set<string>
  /** key -> PR numbers that merged with a closing keyword, checked against ALL of an item's linked PRs before completing ("last linked PR wins"). */
  closingMergesByKey: Map<string, Set<number>>
  /** key -> the GitHub login that first linked it (commit author or PR author), for the auto-assign pass. */
  actorLoginByKey: Map<string, string>
}

export function emptyGithubSyncKeys(): GithubSyncKeys {
  return {
    commitKeys: new Set(),
    closingCommitKeys: new Set(),
    closingMergesByKey: new Map(),
    actorLoginByKey: new Map(),
  }
}

export interface GithubIngestResult {
  inserted: number
}

// Shared by the polling sync (lib/connectors/github.ts) and the webhook
// receiver (app/api/webhooks/github/route.ts): given a batch of freshly-built
// RawEvents plus the keys they touched, resolves every affected work item
// once, applies the in_progress/auto-assign effects before ingesting, then
// ingests and applies the completion effects (which need this batch's own
// pr.merged/pr.closed rows already recorded to evaluate correctly).
export async function runGithubIngest(
  workspaceId: string,
  rawEvents: RawEvent[],
  keys: GithubSyncKeys,
): Promise<GithubIngestResult> {
  const allKeys = Array.from(
    new Set([
      ...keys.commitKeys,
      ...keys.closingCommitKeys,
      ...keys.closingMergesByKey.keys(),
      ...keys.actorLoginByKey.keys(),
    ]),
  )
  const existingItems = allKeys.length
    ? await db
        .select({
          id: workItems.id,
          key: workItems.key,
          status: workItems.status,
          assigneeMemberId: workItems.assigneeMemberId,
        })
        .from(workItems)
        .where(and(eq(workItems.workspaceId, workspaceId), inArray(workItems.key, allKeys)))
    : []
  const itemByKey = new Map(existingItems.filter((item) => item.key).map((item) => [item.key as string, item]))

  // Commits are the closest signal a polling connector has to "branch
  // pushed" (no push-webhook or branch API polling in the polling path): the
  // first commit against a still-unstarted item nudges it into progress,
  // mirroring Linear's "branch pushed -> In Progress" rule.
  for (const key of keys.commitKeys) {
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

  // Linear's documented behavior: linking an item assigns you if it was
  // unassigned. Reuses the same identity resolution ordinary event ingestion
  // uses (name/email/githubUsername/slackHandle/aliases).
  if (keys.actorLoginByKey.size > 0) {
    const roster = await db.select().from(members).where(eq(members.workspaceId, workspaceId))
    for (const [key, actorLogin] of keys.actorLoginByKey) {
      const item = itemByKey.get(key)
      if (!item || item.assigneeMemberId) continue
      const member = resolveMember(roster, actorLogin)
      if (!member) continue
      rawEvents.push({
        type: 'task.assigned',
        source: 'github',
        summary: `${item.key} assigned to ${member.name} — linked from GitHub`,
        task: item.id,
        externalId: `workitem:${item.id}:auto-assigned:${member.id}`,
        payload: { assigneeMemberId: member.id, previousAssigneeMemberId: null, automated: true },
      })
    }
  }

  const result = await ingestEvents(rawEvents, { workspaceId, defaultSource: 'github' })
  let inserted = result.inserted

  // Second pass: now that this batch's pr.merged/pr.closed rows are in the
  // event store, check completion. A closing commit completes immediately —
  // it's already on the default branch, stronger evidence than a PR merge,
  // nothing else to wait for. A closing PR merge still goes through the
  // "last linked PR wins" gate (allClosingPRsResolved).
  const completionEvents: RawEvent[] = []
  for (const key of keys.closingCommitKeys) {
    const item = itemByKey.get(key)
    if (!item || item.status === 'done') continue
    completionEvents.push({
      type: 'task.status_changed',
      source: 'github',
      summary: `${item.key} completed — closing commit pushed to default branch`,
      task: item.id,
      externalId: `workitem:${item.id}:completed-by-commit`,
      payload: { status: 'done', reason: 'closing commit on default branch' },
    })
  }
  for (const key of keys.closingMergesByKey.keys()) {
    const item = itemByKey.get(key)
    if (!item || item.status === 'done') continue
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
    inserted += completionResult.inserted
  }

  return { inserted }
}
