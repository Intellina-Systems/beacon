import 'server-only'

import { and, eq } from 'drizzle-orm'
import { Octokit } from '@octokit/rest'
import { db } from '@/lib/db/client'
import { events, members, workItems, type WorkItemStatus } from '@/lib/db/schema'
import { getGitHubTokenForWorkspace } from '@/lib/github/user-token'
import { ingestEvents, resolveMember } from '@/lib/events/ingest'
import { createComment } from '@/lib/work-items/comment-store'
import { addWatchers } from '@/lib/work-items/watchers'
import { generateId } from '@/lib/utils/id'

// done/cancelled map to a closed GitHub Issue; everything else is "open" —
// there's no richer GitHub-side state to mirror Beacon's fuller status set into.
function githubStateFor(status: WorkItemStatus): 'open' | 'closed' {
  return status === 'done' || status === 'cancelled' ? 'closed' : 'open'
}

function splitExternalId(externalId: string): { owner: string; repo: string; issueNumber: number } | null {
  const [identifier, issueNumberStr] = externalId.split('#')
  const [owner, repo] = (identifier ?? '').split('/')
  const issueNumber = Number(issueNumberStr)
  if (!owner || !repo || !issueNumber) return null
  return { owner, repo, issueNumber }
}

// A pure dedup ledger entry — bypasses ingestEvents deliberately (a second
// task.commented-typed event would double-fire watcher notifications for the
// same comment). Returns true if this call newly claimed the id, false if
// something already claimed it (a redelivery, or the echo of our own
// outbound push). Reuses the same (workspaceId, source, externalId)
// uniqueness ingestEvents already relies on elsewhere.
async function claimGithubDelivery(workspaceId: string, externalId: string, summary: string): Promise<boolean> {
  const inserted = await db
    .insert(events)
    .values({
      id: generateId(16),
      workspaceId,
      source: 'github',
      type: 'system.github_sync_marker',
      summary,
      externalId,
      occurredAt: new Date(),
    })
    .onConflictDoNothing({ target: [events.workspaceId, events.source, events.externalId] })
    .returning({ id: events.id })
  return inserted.length > 0
}

// --- Outbound: Beacon -> GitHub -------------------------------------------

// Called from lib/work-items/update.ts's updateWorkItem after a status
// change on a linked item. Runs after Beacon's own DB write already
// committed, so by the time GitHub's webhook echoes this back,
// syncInboundIssueState's idempotency check already matches — no dedup
// ledger needed here, unlike comments.
export async function syncStatusToGithub(params: {
  workspaceId: string
  externalId: string
  newStatus: WorkItemStatus
  previousStatus: WorkItemStatus
}): Promise<void> {
  const newState = githubStateFor(params.newStatus)
  if (newState === githubStateFor(params.previousStatus)) return

  const target = splitExternalId(params.externalId)
  if (!target) return

  const token = await getGitHubTokenForWorkspace(params.workspaceId)
  if (!token) return

  try {
    const octokit = new Octokit({ auth: token })
    await octokit.rest.issues.update({
      owner: target.owner,
      repo: target.repo,
      issue_number: target.issueNumber,
      state: newState,
    })
  } catch (error) {
    console.error(`[github-issue-sync] failed to update issue state for ${params.externalId}:`, error)
  }
}

// Called from lib/work-items/comments.ts's postComment after a comment is
// created on a linked item. Beacon's workspace token means every outbound
// write appears as the same GitHub account, so attribution has to live in
// the text — same limitation the PR-linking footer already accepts.
export async function syncCommentToGithub(params: {
  workspaceId: string
  workItemId: string
  externalId: string
  authorName: string
  body: string
}): Promise<void> {
  const target = splitExternalId(params.externalId)
  if (!target) return

  const token = await getGitHubTokenForWorkspace(params.workspaceId)
  if (!token) return

  try {
    const octokit = new Octokit({ auth: token })
    const response = await octokit.rest.issues.createComment({
      owner: target.owner,
      repo: target.repo,
      issue_number: target.issueNumber,
      body: `**${params.authorName}** commented via Beacon:\n\n${params.body}`,
    })
    // Pre-claim the echo of this exact comment before it can arrive via
    // webhook, so syncInboundIssueComment recognizes it and skips.
    await claimGithubDelivery(
      params.workspaceId,
      `github:${target.owner}/${target.repo}:issue-comment:${response.data.id}`,
      `${params.authorName}'s comment synced to GitHub`,
    )
  } catch (error) {
    console.error(`[github-issue-sync] failed to push comment for ${params.externalId}:`, error)
  }
}

// --- Inbound: GitHub -> Beacon ---------------------------------------------

interface LinkedWorkItem {
  id: string
  key: string | null
  title: string
  status: WorkItemStatus
}

async function findLinkedWorkItem(
  workspaceId: string,
  repoIdentifier: string,
  issueNumber: number,
): Promise<LinkedWorkItem | null> {
  const externalId = `${repoIdentifier}#${issueNumber}`
  const [item] = await db
    .select({ id: workItems.id, key: workItems.key, title: workItems.title, status: workItems.status })
    .from(workItems)
    .where(
      and(
        eq(workItems.workspaceId, workspaceId),
        eq(workItems.externalProvider, 'github'),
        eq(workItems.externalId, externalId),
      ),
    )
    .limit(1)
  return item ?? null
}

// Called from the webhook route for `issues` deliveries (action closed/reopened).
export async function syncInboundIssueState(
  workspaceId: string,
  repoIdentifier: string,
  issueNumber: number,
  state: 'open' | 'closed',
  updatedAt: string,
): Promise<void> {
  const item = await findLinkedWorkItem(workspaceId, repoIdentifier, issueNumber)
  if (!item) return
  if (githubStateFor(item.status) === state) return // already there — our own outbound push echoing back, or a repeat delivery

  const targetStatus: WorkItemStatus = state === 'closed' ? 'done' : 'todo'
  await ingestEvents(
    [
      {
        type: 'task.status_changed',
        source: 'github',
        summary: `${item.key ?? item.title} ${state === 'closed' ? 'completed' : 'reopened'} — GitHub issue ${state}`,
        task: item.id,
        // updatedAt discriminates real transitions from redeliveries of the
        // same one — a static key would collide on a later close/reopen cycle.
        externalId: `workitem:${item.id}:github-issue-${state}:${updatedAt}`,
        payload: { status: targetStatus, previousStatus: item.status, reason: `github issue ${state}` },
      },
    ],
    { workspaceId, defaultSource: 'github' },
  )
}

// Called from the webhook route for `issue_comment` deliveries (action
// created, and only for genuine Issues — the route filters out PR comments
// before calling this, since GitHub fires the same event for both).
export async function syncInboundIssueComment(
  workspaceId: string,
  repoIdentifier: string,
  issueNumber: number,
  comment: { id: number; body: string; user: { login: string } | null },
): Promise<void> {
  const item = await findLinkedWorkItem(workspaceId, repoIdentifier, issueNumber)
  if (!item) return

  const markerExternalId = `github:${repoIdentifier}:issue-comment:${comment.id}`
  const claimed = await claimGithubDelivery(
    workspaceId,
    markerExternalId,
    `GitHub comment synced to ${item.key ?? item.title}`,
  )
  if (!claimed) return // redelivery, or the echo of our own outbound push

  const roster = await db.select().from(members).where(eq(members.workspaceId, workspaceId))
  const member = comment.user?.login ? resolveMember(roster, comment.user.login) : null
  const displayName = member?.name ?? comment.user?.login ?? 'Someone on GitHub'
  const body = member ? comment.body : `_@${comment.user?.login ?? 'unknown'} commented on GitHub:_\n\n${comment.body}`

  const row = await createComment({
    workspaceId,
    workItemId: item.id,
    authorMemberId: member?.id ?? null,
    body,
  })
  if (member) {
    await addWatchers(workspaceId, item.id, [{ memberId: member.id, reason: 'manual' }])
  }

  await ingestEvents(
    [
      {
        type: 'task.commented',
        source: 'github',
        summary: `${displayName} commented on ${item.key ?? item.title} (via GitHub)`,
        task: item.id,
        engineer: displayName,
        externalId: `workitem:${item.id}:comment:${row.id}`,
        payload: { commentId: row.id },
      },
    ],
    { workspaceId, defaultSource: 'github' },
  )
}
