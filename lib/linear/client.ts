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
        organization { id name urlKey }
      }
    }`,
  )
  return data.viewer
}

export interface LinearIssue {
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

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  state { id name type }
  priority
  assignee { id name }
  dueDate
  url
  createdAt
  updatedAt
  project { id name }
  team { id name key }
`

export interface LinearIssueScope {
  projectId?: string
  teamId?: string
  updatedSince?: Date
}

export async function getLinearIssues(accessToken: string, scope: LinearIssueScope = {}): Promise<LinearIssue[]> {
  const filter: Record<string, unknown> = {}
  if (scope.projectId) filter.project = { id: { eq: scope.projectId } }
  if (scope.teamId) filter.team = { id: { eq: scope.teamId } }
  if (scope.updatedSince) filter.updatedAt = { gt: scope.updatedSince.toISOString() }

  const query = `query GetIssues($after: String, $filter: IssueFilter) {
    issues(first: 100, after: $after, filter: $filter) {
      nodes { ${ISSUE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }`

  const allIssues: LinearIssue[] = []
  let after: string | null = null

  while (true) {
    const page: {
      issues: { nodes: LinearIssue[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }
    } = await linearQuery(accessToken, query, { after, filter: Object.keys(filter).length ? filter : undefined })

    allIssues.push(...page.issues.nodes)

    if (!page.issues.pageInfo.hasNextPage || !page.issues.pageInfo.endCursor) break
    after = page.issues.pageInfo.endCursor
  }

  return allIssues
}

export interface LinearProjectSummary {
  id: string
  name: string
  url: string | null
}

export interface LinearTeamSummary {
  id: string
  name: string
  key: string
}

export async function getLinearProjects(accessToken: string): Promise<LinearProjectSummary[]> {
  const data = await linearQuery<{ projects: { nodes: LinearProjectSummary[] } }>(
    accessToken,
    `query { projects(first: 100) { nodes { id name url } } }`,
  )
  return data.projects.nodes
}

export interface LinearUserSummary {
  id: string
  name: string
}

export async function getLinearUsers(accessToken: string): Promise<LinearUserSummary[]> {
  const data = await linearQuery<{ users: { nodes: LinearUserSummary[] } }>(
    accessToken,
    `query { users(first: 100) { nodes { id name } } }`,
  )
  return data.users.nodes
}

export async function getLinearTeams(accessToken: string): Promise<LinearTeamSummary[]> {
  const data = await linearQuery<{ teams: { nodes: LinearTeamSummary[] } }>(
    accessToken,
    `query { teams(first: 100) { nodes { id name key } } }`,
  )
  return data.teams.nodes
}
