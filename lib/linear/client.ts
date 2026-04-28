const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql'

async function linearQuery<T>(accessToken: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`Linear API request failed with status ${response.status}`)
  }

  const data = (await response.json()) as { data?: T; errors?: Array<{ message: string }> }

  if (data.errors?.length) {
    throw new Error(`Linear API error: ${data.errors[0].message}`)
  }

  return data.data as T
}

export interface LinearViewer {
  id: string
  name: string
  email: string
  organization: {
    id: string
    name: string
    urlKey: string
  }
}

export async function getLinearViewer(accessToken: string): Promise<LinearViewer> {
  const data = await linearQuery<{ viewer: LinearViewer }>(
    accessToken,
    `query {
      viewer {
        id
        name
        email
        organization {
          id
          name
          urlKey
        }
      }
    }`,
  )
  return data.viewer
}

export interface LinearProject {
  id: string
  name: string
  description: string | null
  state: string
  url: string
  teams: { nodes: Array<{ id: string; name: string }> }
}

export async function getLinearProjects(accessToken: string): Promise<LinearProject[]> {
  const data = await linearQuery<{ projects: { nodes: LinearProject[] } }>(
    accessToken,
    `query {
      projects(first: 100) {
        nodes {
          id
          name
          description
          state
          url
          teams {
            nodes {
              id
              name
            }
          }
        }
      }
    }`,
  )
  return data.projects.nodes
}

export interface LinearIssue {
  id: string
  title: string
  description: string | null
  state: { id: string; name: string; type: string }
  priority: number
  assignee: { id: string; name: string } | null
  dueDate: string | null
  url: string
  createdAt: string
  updatedAt: string
}

export async function getLinearProjectIssues(accessToken: string, projectId: string): Promise<LinearIssue[]> {
  const data = await linearQuery<{ project: { issues: { nodes: LinearIssue[] } } }>(
    accessToken,
    `query GetProjectIssues($projectId: String!) {
      project(id: $projectId) {
        issues(first: 250) {
          nodes {
            id
            title
            description
            state {
              id
              name
              type
            }
            priority
            assignee {
              id
              name
            }
            dueDate
            url
            createdAt
            updatedAt
          }
        }
      }
    }`,
    { projectId },
  )
  return data.project?.issues?.nodes ?? []
}

export interface LinearWorkspaceIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  state: { id: string; name: string; type: string }
  priority: number
  assignee: { id: string; name: string } | null
  dueDate: string | null
  url: string
  createdAt: string
  updatedAt: string
  project: { id: string; name: string } | null
  team: { id: string; name: string; key: string } | null
}

type LinearIssuesPage = {
  issues: {
    nodes: LinearWorkspaceIssue[]
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }
}

export async function getLinearIssues(accessToken: string): Promise<LinearWorkspaceIssue[]> {
  const allIssues: LinearWorkspaceIssue[] = []
  let after: string | null = null

  while (true) {
    const page: LinearIssuesPage = await linearQuery<LinearIssuesPage>(
      accessToken,
      `query GetIssues($after: String) {
        issues(first: 100, after: $after) {
          nodes {
            id
            identifier
            title
            description
            state {
              id
              name
              type
            }
            priority
            assignee {
              id
              name
            }
            dueDate
            url
            createdAt
            updatedAt
            project {
              id
              name
            }
            team {
              id
              name
              key
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      { after },
    )

    allIssues.push(...page.issues.nodes)

    if (!page.issues.pageInfo.hasNextPage || !page.issues.pageInfo.endCursor) {
      break
    }
    after = page.issues.pageInfo.endCursor
  }

  return allIssues
}

export interface LinearUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  active: boolean
}

export async function getLinearUsers(accessToken: string): Promise<LinearUser[]> {
  const data = await linearQuery<{ users: { nodes: LinearUser[] } }>(
    accessToken,
    `query {
      users(filter: { active: { eq: true } }, first: 100) {
        nodes {
          id
          name
          email
          avatarUrl
          active
        }
      }
    }`,
  )
  return data.users.nodes
}
