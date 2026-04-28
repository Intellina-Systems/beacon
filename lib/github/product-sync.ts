import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { Octokit } from '@octokit/rest'
import { db } from '@/lib/db/client'
import {
  githubCommits,
  githubLinearLinks,
  githubPullRequests,
  linearIssues,
  type ProductGitHubRepository,
} from '@/lib/db/schema'
import { getOctokit } from '@/lib/github/client'
import { getGitHubTokenForUserId } from '@/lib/github/user-token'

const LINEAR_IDENTIFIER_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/g
const GITHUB_HISTORY_DAYS = 90

export interface GitHubRepositoryOption {
  owner: string
  repo: string
  repoUrl: string
  defaultBranch: string | null
  private: boolean
}

export interface ProductGitHubSyncResult {
  pullRequestsSynced: number
  commitsSynced: number
  linksCreated: number
}

type GitHubApiError = {
  status?: number
}

export function getGitHubApiErrorMessage(error: unknown): string {
  const status =
    typeof error === 'object' && error !== null && 'status' in error ? (error as GitHubApiError).status : null

  if (status === 401) {
    return 'GitHub authorization expired. Reconnect GitHub and try again.'
  }

  if (status === 403) {
    return 'GitHub denied access. For private organization repositories, approve Beacon in the GitHub organization or reconnect GitHub with private repository access.'
  }

  if (status === 404) {
    return 'Repository not found or Beacon is not authorized to access it. Check collaborator access, organization OAuth approval, and private repository authorization.'
  }

  if (status === 409) {
    return 'GitHub repository is empty or unavailable for commit sync.'
  }

  return 'GitHub sync failed. Check the repository access and try again.'
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null
}

function getSinceDate(): Date {
  const since = new Date()
  since.setDate(since.getDate() - GITHUB_HISTORY_DAYS)
  return since
}

function extractLinearIdentifiers(...values: Array<string | null | undefined>): string[] {
  const identifiers = new Set<string>()

  for (const value of values) {
    if (!value) continue
    const matches = value.toUpperCase().match(LINEAR_IDENTIFIER_PATTERN) ?? []
    for (const match of matches) identifiers.add(match)
  }

  return Array.from(identifiers)
}

async function getIssueMapForIdentifiers(userId: string, identifiers: string[]) {
  if (identifiers.length === 0) {
    return new Map<string, string>()
  }

  const rows = await db
    .select({ id: linearIssues.id, identifier: linearIssues.identifier })
    .from(linearIssues)
    .where(and(eq(linearIssues.userId, userId), inArray(linearIssues.identifier, identifiers)))

  return new Map(rows.map((row) => [row.identifier, row.id]))
}

async function ensurePullRequestLinks(productId: string, userId: string, pullRequestId: string, identifiers: string[]) {
  const issueMap = await getIssueMapForIdentifiers(userId, identifiers)
  let linksCreated = 0

  for (const linearIssueId of issueMap.values()) {
    const existing = await db
      .select({ id: githubLinearLinks.id })
      .from(githubLinearLinks)
      .where(
        and(
          eq(githubLinearLinks.productId, productId),
          eq(githubLinearLinks.linearIssueId, linearIssueId),
          eq(githubLinearLinks.githubPullRequestId, pullRequestId),
        ),
      )
      .limit(1)

    if (existing.length > 0) continue

    await db.insert(githubLinearLinks).values({
      id: nanoid(),
      productId,
      linearIssueId,
      githubPullRequestId: pullRequestId,
      source: 'identifier_match',
      status: 'accepted',
    })
    linksCreated++
  }

  return linksCreated
}

async function ensureCommitLinks(productId: string, userId: string, commitId: string, identifiers: string[]) {
  const issueMap = await getIssueMapForIdentifiers(userId, identifiers)
  let linksCreated = 0

  for (const linearIssueId of issueMap.values()) {
    const existing = await db
      .select({ id: githubLinearLinks.id })
      .from(githubLinearLinks)
      .where(
        and(
          eq(githubLinearLinks.productId, productId),
          eq(githubLinearLinks.linearIssueId, linearIssueId),
          eq(githubLinearLinks.githubCommitId, commitId),
        ),
      )
      .limit(1)

    if (existing.length > 0) continue

    await db.insert(githubLinearLinks).values({
      id: nanoid(),
      productId,
      linearIssueId,
      githubCommitId: commitId,
      source: 'identifier_match',
      status: 'accepted',
    })
    linksCreated++
  }

  return linksCreated
}

export async function listGitHubRepositories(): Promise<GitHubRepositoryOption[]> {
  const octokit = await getOctokit()
  if (!octokit.auth) {
    return []
  }

  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    affiliation: 'owner,collaborator,organization_member',
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  })

  return repos.slice(0, 100).map((repo) => ({
    owner: repo.owner.login,
    repo: repo.name,
    repoUrl: repo.html_url,
    defaultBranch: repo.default_branch ?? null,
    private: repo.private,
  }))
}

export async function getGitHubRepositoryMetadata(owner: string, repo: string) {
  const octokit = await getOctokit()
  if (!octokit.auth) {
    return null
  }

  const response = await octokit.rest.repos.get({ owner, repo })
  return {
    owner: response.data.owner.login,
    repo: response.data.name,
    repoUrl: response.data.html_url,
    defaultBranch: response.data.default_branch ?? null,
  }
}

export async function syncProductGitHubRepository(
  userId: string,
  repository: ProductGitHubRepository,
): Promise<ProductGitHubSyncResult> {
  const token = await getGitHubTokenForUserId(userId)
  if (!token) {
    throw new Error('GitHub account not connected')
  }
  const octokit = new Octokit({ auth: token })

  const now = new Date()
  const since = getSinceDate()
  let pullRequestsSynced = 0
  let commitsSynced = 0
  let linksCreated = 0

  const pullRequests = await octokit.paginate(octokit.rest.pulls.list, {
    owner: repository.owner,
    repo: repository.repo,
    state: 'all',
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  })

  for (const pr of pullRequests) {
    const updatedAt = toDate(pr.updated_at)
    if (updatedAt && updatedAt < since && pr.state !== 'open') {
      continue
    }

    const reviewers = pr.requested_reviewers?.map((reviewer) => reviewer.login).filter(Boolean) ?? []
    const labels = pr.labels.map((label) => label.name).filter(Boolean)
    const [row] = await db
      .insert(githubPullRequests)
      .values({
        id: nanoid(),
        productId: repository.productId,
        repositoryId: repository.id,
        githubPrId: `${pr.id}`,
        number: pr.number,
        title: pr.title,
        body: pr.body ?? null,
        state: pr.merged_at ? 'merged' : pr.state,
        authorLogin: pr.user?.login ?? null,
        headRefName: pr.head.ref,
        baseRefName: pr.base.ref,
        reviewers,
        labels,
        htmlUrl: pr.html_url,
        githubCreatedAt: toDate(pr.created_at),
        githubUpdatedAt: updatedAt,
        githubMergedAt: toDate(pr.merged_at),
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [githubPullRequests.repositoryId, githubPullRequests.githubPrId],
        set: {
          title: pr.title,
          body: pr.body ?? null,
          state: pr.merged_at ? 'merged' : pr.state,
          authorLogin: pr.user?.login ?? null,
          headRefName: pr.head.ref,
          baseRefName: pr.base.ref,
          reviewers,
          labels,
          htmlUrl: pr.html_url,
          githubCreatedAt: toDate(pr.created_at),
          githubUpdatedAt: updatedAt,
          githubMergedAt: toDate(pr.merged_at),
          lastSyncedAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: githubPullRequests.id })

    pullRequestsSynced++
    const identifiers = extractLinearIdentifiers(pr.title, pr.body, pr.head.ref)
    linksCreated += await ensurePullRequestLinks(repository.productId, userId, row.id, identifiers)
  }

  const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
    owner: repository.owner,
    repo: repository.repo,
    since: since.toISOString(),
    per_page: 100,
  })

  for (const commit of commits) {
    const [row] = await db
      .insert(githubCommits)
      .values({
        id: nanoid(),
        productId: repository.productId,
        repositoryId: repository.id,
        sha: commit.sha,
        message: commit.commit.message,
        authorName: commit.commit.author?.name ?? null,
        authorLogin: commit.author?.login ?? null,
        htmlUrl: commit.html_url,
        committedAt: toDate(commit.commit.author?.date),
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [githubCommits.repositoryId, githubCommits.sha],
        set: {
          message: commit.commit.message,
          authorName: commit.commit.author?.name ?? null,
          authorLogin: commit.author?.login ?? null,
          htmlUrl: commit.html_url,
          committedAt: toDate(commit.commit.author?.date),
          lastSyncedAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: githubCommits.id })

    commitsSynced++
    const identifiers = extractLinearIdentifiers(commit.commit.message)
    linksCreated += await ensureCommitLinks(repository.productId, userId, row.id, identifiers)
  }

  return {
    pullRequestsSynced,
    commitsSynced,
    linksCreated,
  }
}
