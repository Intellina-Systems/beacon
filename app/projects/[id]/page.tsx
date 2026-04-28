import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { ArrowLeft, ExternalLink, Github, GitCommit, GitPullRequest, ListTodo, Settings, Users } from 'lucide-react'
import { db } from '@/lib/db/client'
import {
  accounts,
  githubCommits,
  githubLinearLinks,
  githubPullRequests,
  linearConnections,
  linearIssues,
  members,
  productGitHubRepositories,
  productLinearConnections,
  products,
  users,
} from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { getLinearProjects } from '@/lib/linear/client'
import { getServerSession } from '@/lib/session/get-server-session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductSettings } from '@/components/products/product-settings'

const PRIORITY_LABEL: Record<number, string> = {
  0: 'None',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
}

async function getGitHubConnection(userId: string) {
  const account = await db
    .select({ username: accounts.username })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
    .limit(1)

  if (account[0]) {
    return { connected: true, username: account[0].username }
  }

  const user = await db
    .select({ username: users.username })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.provider, 'github')))
    .limit(1)

  if (user[0]) {
    return { connected: true, username: user[0].username }
  }

  return { connected: false, username: null }
}

function formatDate(value: Date | null) {
  if (!value) return 'Unknown'
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session?.user) {
    redirect('/')
  }

  const { id } = await params
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.userId, session.user.id)))
    .limit(1)

  if (!product) {
    notFound()
  }

  const [linearConnectionRows, attachedLinearProjects, repositories, teamMembers, githubConnection] = await Promise.all(
    [
      db.select().from(linearConnections).where(eq(linearConnections.userId, session.user.id)).limit(1),
      db.select().from(productLinearConnections).where(eq(productLinearConnections.productId, id)),
      db.select().from(productGitHubRepositories).where(eq(productGitHubRepositories.productId, id)),
      db.select().from(members).where(eq(members.userId, session.user.id)).orderBy(members.name),
      getGitHubConnection(session.user.id),
    ],
  )

  const linearConnection = linearConnectionRows[0] ?? null
  const linearProjectIds = attachedLinearProjects.map((connection) => connection.linearProjectId)

  const [issues, pullRequests, commits, links] = await Promise.all([
    linearProjectIds.length > 0
      ? db
          .select()
          .from(linearIssues)
          .where(and(eq(linearIssues.userId, session.user.id), inArray(linearIssues.linearProjectId, linearProjectIds)))
          .orderBy(linearIssues.priority, desc(linearIssues.linearUpdatedAt), desc(linearIssues.updatedAt))
      : Promise.resolve([]),
    db
      .select()
      .from(githubPullRequests)
      .where(eq(githubPullRequests.productId, id))
      .orderBy(desc(githubPullRequests.githubUpdatedAt), desc(githubPullRequests.updatedAt))
      .limit(25),
    db
      .select()
      .from(githubCommits)
      .where(eq(githubCommits.productId, id))
      .orderBy(desc(githubCommits.committedAt), desc(githubCommits.updatedAt))
      .limit(25),
    db
      .select({
        id: githubLinearLinks.id,
        status: githubLinearLinks.status,
        source: githubLinearLinks.source,
        issueIdentifier: linearIssues.identifier,
        issueTitle: linearIssues.title,
        pullRequestTitle: githubPullRequests.title,
        pullRequestUrl: githubPullRequests.htmlUrl,
        commitMessage: githubCommits.message,
        commitUrl: githubCommits.htmlUrl,
      })
      .from(githubLinearLinks)
      .innerJoin(linearIssues, eq(linearIssues.id, githubLinearLinks.linearIssueId))
      .leftJoin(githubPullRequests, eq(githubPullRequests.id, githubLinearLinks.githubPullRequestId))
      .leftJoin(githubCommits, eq(githubCommits.id, githubLinearLinks.githubCommitId))
      .where(eq(githubLinearLinks.productId, id))
      .limit(30),
  ])

  let availableLinearProjects: Array<{ id: string; name: string; teamName: string | null }> = []
  if (linearConnection) {
    try {
      const accessToken = decrypt(linearConnection.accessToken)
      availableLinearProjects = (await getLinearProjects(accessToken)).map((project) => ({
        id: project.id,
        name: project.name,
        teamName: project.teams.nodes[0]?.name ?? null,
      }))
    } catch {
      availableLinearProjects = []
    }
  }

  const activeIssues = issues.filter((issue) => !['completed', 'cancelled'].includes(issue.statusType ?? ''))
  const openPullRequests = pullRequests.filter((pullRequest) => pullRequest.state === 'open')
  const acceptedLinks = links.filter((link) => link.status === 'accepted')
  const suggestedLinks = links.filter((link) => link.status === 'suggested')

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Products
          </Link>
        </Button>
      </div>

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {product.description && <p className="mt-1 max-w-2xl text-muted-foreground">{product.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {product.clientVertical && <Badge variant="outline">{product.clientVertical}</Badge>}
            <Badge variant="secondary">{attachedLinearProjects.length} Linear projects</Badge>
            <Badge variant="secondary">{repositories.length} GitHub repos</Badge>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="gap-5">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="work">Work</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Work</CardDescription>
                <CardTitle>{activeIssues.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Open PRs</CardDescription>
                <CardTitle>{openPullRequests.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Recent Commits</CardDescription>
                <CardTitle>{commits.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Code Links</CardDescription>
                <CardTitle>{acceptedLinks.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Needs Attention</CardTitle>
                <CardDescription>Product-scoped work and code signals.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {attachedLinearProjects.length === 0 && (
                  <p className="text-muted-foreground">Attach Linear projects in Settings.</p>
                )}
                {repositories.length === 0 && (
                  <p className="text-muted-foreground">Attach GitHub repositories in Settings.</p>
                )}
                {suggestedLinks.length > 0 && <p>{suggestedLinks.length} AI-suggested code links need review.</p>}
                {attachedLinearProjects.length > 0 && repositories.length > 0 && suggestedLinks.length === 0 && (
                  <p className="text-muted-foreground">No review-gated link suggestions are waiting.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Linked Activity</CardTitle>
                <CardDescription>Deterministic Linear identifiers found in GitHub activity.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {acceptedLinks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Linear/GitHub links found yet.</p>
                ) : (
                  acceptedLinks.slice(0, 6).map((link) => (
                    <div key={link.id} className="rounded-md border px-3 py-2 text-sm">
                      <p className="font-medium">{link.issueIdentifier}</p>
                      <p className="line-clamp-1 text-muted-foreground">
                        {link.pullRequestTitle ?? link.commitMessage ?? link.issueTitle}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="work">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListTodo className="h-4 w-4" />
                Linear Work
              </CardTitle>
              <CardDescription>Issues from the Linear projects attached to this product.</CardDescription>
            </CardHeader>
            <CardContent>
              {issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Attach and sync Linear projects to see product-scoped work.
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Issue</th>
                        <th className="w-32 px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                        <th className="w-24 px-4 py-2.5 text-left font-medium text-muted-foreground">Priority</th>
                        <th className="w-36 px-4 py-2.5 text-left font-medium text-muted-foreground">Owner</th>
                        <th className="w-12 px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {issues.slice(0, 50).map((issue) => (
                        <tr key={issue.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <p className="font-medium">{issue.identifier}</p>
                            <p className="line-clamp-1 text-muted-foreground">{issue.title}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{issue.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{PRIORITY_LABEL[issue.priority ?? 0]}</td>
                          <td className="px-4 py-3 text-muted-foreground">{issue.assigneeName ?? '-'}</td>
                          <td className="px-4 py-3">
                            {issue.linearUrl && (
                              <a href={issue.linearUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="code">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitPullRequest className="h-4 w-4" />
                  Pull Requests
                </CardTitle>
                <CardDescription>Recent PRs from attached repositories.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {pullRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Attach a repository and sync GitHub to import pull requests.
                  </p>
                ) : (
                  pullRequests.map((pullRequest) => (
                    <a
                      key={pullRequest.id}
                      href={pullRequest.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-1 font-medium">
                            #{pullRequest.number} {pullRequest.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {pullRequest.authorLogin ?? 'Unknown'} · {formatDate(pullRequest.githubUpdatedAt)}
                          </p>
                        </div>
                        <Badge variant={pullRequest.state === 'open' ? 'default' : 'secondary'}>
                          {pullRequest.state}
                        </Badge>
                      </div>
                    </a>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitCommit className="h-4 w-4" />
                  Commits
                </CardTitle>
                <CardDescription>Recent commits imported from the last 90 days.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {commits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No commits imported yet.</p>
                ) : (
                  commits.map((commit) => (
                    <a
                      key={commit.id}
                      href={commit.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/40"
                    >
                      <p className="line-clamp-1 font-medium">{commit.message.split('\n')[0]}</p>
                      <p className="text-xs text-muted-foreground">
                        {commit.authorLogin ?? commit.authorName ?? 'Unknown'} · {formatDate(commit.committedAt)}
                      </p>
                    </a>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Team
              </CardTitle>
              <CardDescription>Current Beacon roster. Product-specific ownership comes next.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              {teamMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No team members yet.</p>
              ) : (
                teamMembers.map((member) => (
                  <div key={member.id} className="rounded-md border px-3 py-2">
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.role ?? member.email ?? 'No role set'}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="h-4 w-4" />
            Connect product-scoped sources. Sync is read-only for GitHub.
          </div>
          <ProductSettings
            productId={id}
            linearConnected={Boolean(linearConnection)}
            linearWorkspaceName={linearConnection?.workspaceName ?? linearConnection?.workspaceSlug ?? null}
            availableLinearProjects={availableLinearProjects}
            attachedLinearProjects={attachedLinearProjects}
            githubConnected={githubConnection.connected}
            githubUsername={githubConnection.username}
            repositories={repositories}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
