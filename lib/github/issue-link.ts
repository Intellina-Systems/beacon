import 'server-only'

import { and, eq } from 'drizzle-orm'
import { Octokit } from '@octokit/rest'
import { db } from '@/lib/db/client'
import { signalSources, workItems } from '@/lib/db/schema'
import { getGitHubTokenForWorkspace } from '@/lib/github/user-token'
import { workItemHref } from '@/lib/work-items/href'

export interface LinkGithubIssueResult {
  ok: boolean
  reason?: string
  externalUrl?: string
}

// A work item's project may have zero, one, or (in principle) more than one
// connected repo — only the unambiguous case is safe to auto-target. No
// existing reverse lookup for this (projectId -> connected repo) exists.
async function resolveRepoForProject(workspaceId: string, projectId: string | null): Promise<string | null> {
  if (!projectId) return null
  const rows = await db
    .select({ identifier: signalSources.identifier })
    .from(signalSources)
    .where(
      and(
        eq(signalSources.workspaceId, workspaceId),
        eq(signalSources.projectId, projectId),
        eq(signalSources.kind, 'github_repo'),
      ),
    )
  return rows.length === 1 ? rows[0].identifier : null
}

// Creates a GitHub Issue for a freshly-created work item and links the two
// via the existing externalProvider/externalId/externalUrl columns (already
// on workItems, designed for exactly this "mirrored from an external
// tracker" case, previously unpopulated). Never throws — a link failure
// should never fail the work item creation it's attached to.
export async function linkWorkItemToGithubIssue(params: {
  workspaceId: string
  workItem: { id: string; key: string | null; title: string; description: string | null; projectId: string | null }
  actorName: string
  origin: string
}): Promise<LinkGithubIssueResult> {
  const identifier = await resolveRepoForProject(params.workspaceId, params.workItem.projectId)
  if (!identifier) return { ok: false, reason: 'No single connected GitHub repo for this item’s project' }

  const token = await getGitHubTokenForWorkspace(params.workspaceId)
  if (!token) return { ok: false, reason: 'GitHub is not connected for this workspace' }

  const [owner, repo] = identifier.split('/')
  if (!owner || !repo) return { ok: false, reason: `Invalid repository identifier: ${identifier}` }

  const beaconUrl = `${params.origin}${workItemHref({ id: params.workItem.id, key: params.workItem.key })}`
  const label = params.workItem.key ?? params.workItem.id
  const body = [
    params.workItem.description ?? '',
    '',
    '---',
    `_Linked to [${label}](${beaconUrl}) in Beacon, created by ${params.actorName}._`,
  ].join('\n')

  try {
    const octokit = new Octokit({ auth: token })
    const response = await octokit.rest.issues.create({ owner, repo, title: params.workItem.title, body })
    const externalId = `${identifier}#${response.data.number}`

    await db
      .update(workItems)
      .set({
        externalProvider: 'github',
        externalId,
        externalUrl: response.data.html_url,
        updatedAt: new Date(),
      })
      .where(eq(workItems.id, params.workItem.id))

    return { ok: true, externalUrl: response.data.html_url }
  } catch (error) {
    console.error(`[github-issue-link] failed to create issue for ${identifier}:`, error)
    return { ok: false, reason: 'GitHub issue creation failed' }
  }
}
