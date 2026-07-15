import 'server-only'

import { getOctokit } from './client'

export interface GitHubRepositoryOption {
  owner: string
  repo: string
  repoUrl: string
  defaultBranch: string | null
  private: boolean
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
    return 'Repository not found or Beacon is not authorized to access it.'
  }

  return 'GitHub request failed. Check the repository access and try again.'
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
