import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { and, count, desc, eq, isNotNull } from 'drizzle-orm'
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Github, GitCommit, GitPullRequest, ListTodo, Settings, Users } from 'lucide-react'
import { db } from '@/lib/db/client'
import {
  accounts,
  githubCommits,
  githubLinearLinks,
  githubPullRequests,
  knowledgeDocuments,
  knowledgeSignals,
  linearConnections,
  linearIssues,
  members,
  productGitHubRepositories,
  productLinearConnections,
  products,
  users,
} from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KnowledgeIngestion } from '@/components/products/knowledge-ingestion'
import { ProductSettings } from '@/components/products/product-settings'
import { CommitFilters, PRFilters } from '@/components/products/code-filters'

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

const PAGE_SIZE = 25

function PaginationControls({
  page,
  totalPages,
  prPage,
  commitPage,
  paramName,
  productId,
}: {
  page: number
  totalPages: number
  prPage: number
  commitPage: number
  paramName: 'prPage' | 'commitPage'
  productId: string
}) {
  if (totalPages <= 1) return null

  const buildHref = (newPage: number) => {
    const p = paramName === 'prPage' ? newPage : prPage
    const c = paramName === 'commitPage' ? newPage : commitPage
    const parts: string[] = []
    if (p !== 1) parts.push(`prPage=${p}`)
    if (c !== 1) parts.push(`commitPage=${c}`)
    return `/projects/${productId}${parts.length ? `?${parts.join('&')}` : ''}`
  }

  return (
    <div className="flex items-center justify-between mt-3 text-sm">
      <span className="text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-1">
        {page > 1 && (
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Link>
          </Button>
        )}
        {page < totalPages && (
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref(page + 1)}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const session = await getServerSession()
  if (!session?.user) {
    redirect('/')
  }

  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams])
  const prPage = Math.max(1, parseInt(resolvedSearchParams.prPage ?? '1', 10) || 1)
  const commitPage = Math.max(1, parseInt(resolvedSearchParams.commitPage ?? '1', 10) || 1)
  const prStateFilter = resolvedSearchParams.prState ?? ''
  const prAuthorFilter = resolvedSearchParams.prAuthor ?? ''
  const commitAuthorFilter = resolvedSearchParams.commitAuthor ?? ''
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.userId, session.user.id)))
    .limit(1)

  if (!product) {
    notFound()
  }

  const [linearConnectionRows, attachedLinearWorkspaces, repositories, teamMembers, githubConnection] =
    await Promise.all([
      db.select().from(linearConnections).where(eq(linearConnections.userId, session.user.id)).limit(1),
      db.select().from(productLinearConnections).where(eq(productLinearConnections.productId, id)),
      db.select().from(productGitHubRepositories).where(eq(productGitHubRepositories.productId, id)),
      db.select().from(members).where(eq(members.userId, session.user.id)).orderBy(members.name),
      getGitHubConnection(session.user.id),
    ])

  const linearConnection = linearConnectionRows[0] ?? null
  const attachedLinearWorkspace = linearConnection
    ? (attachedLinearWorkspaces.find((connection) => connection.linearWorkspaceId === linearConnection.workspaceId) ??
      null)
    : null

  const [prCountRows, commitCountRows] = await Promise.all([
    db
      .select({ repositoryId: githubPullRequests.repositoryId, total: count(githubPullRequests.id) })
      .from(githubPullRequests)
      .where(eq(githubPullRequests.productId, id))
      .groupBy(githubPullRequests.repositoryId),
    db
      .select({ repositoryId: githubCommits.repositoryId, total: count(githubCommits.id) })
      .from(githubCommits)
      .where(eq(githubCommits.productId, id))
      .groupBy(githubCommits.repositoryId),
  ])

  const prCountMap = new Map(prCountRows.map((r) => [r.repositoryId, r.total]))
  const commitCountMap = new Map(commitCountRows.map((r) => [r.repositoryId, r.total]))
  const repositoriesWithStats = repositories.map((repo) => ({
    ...repo,
    pullRequestCount: prCountMap.get(repo.id) ?? 0,
    commitCount: commitCountMap.get(repo.id) ?? 0,
  }))

  const prWhere = and(
    eq(githubPullRequests.productId, id),
    prStateFilter ? eq(githubPullRequests.state, prStateFilter) : undefined,
    prAuthorFilter ? eq(githubPullRequests.authorLogin, prAuthorFilter) : undefined,
  )
  const commitWhere = and(
    eq(githubCommits.productId, id),
    commitAuthorFilter ? eq(githubCommits.authorLogin, commitAuthorFilter) : undefined,
  )

  const [issues, pullRequests, commits, prTotalRows, commitTotalRows, prAuthorRows, commitAuthorRows, links, knowledgeDocumentRows, knowledgeSignalRows] = await Promise.all([
    attachedLinearWorkspace
      ? db
          .select()
          .from(linearIssues)
          .where(eq(linearIssues.userId, session.user.id))
          .orderBy(linearIssues.priority, desc(linearIssues.linearUpdatedAt), desc(linearIssues.updatedAt))
      : Promise.resolve([]),
    db
      .select()
      .from(githubPullRequests)
      .where(prWhere)
      .orderBy(desc(githubPullRequests.githubUpdatedAt), desc(githubPullRequests.updatedAt))
      .limit(PAGE_SIZE)
      .offset((prPage - 1) * PAGE_SIZE),
    db
      .select()
      .from(githubCommits)
      .where(commitWhere)
      .orderBy(desc(githubCommits.committedAt), desc(githubCommits.updatedAt))
      .limit(PAGE_SIZE)
      .offset((commitPage - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(githubPullRequests).where(prWhere),
    db.select({ total: count() }).from(githubCommits).where(commitWhere),
    db
      .selectDistinct({ authorLogin: githubPullRequests.authorLogin })
      .from(githubPullRequests)
      .where(and(eq(githubPullRequests.productId, id), isNotNull(githubPullRequests.authorLogin)))
      .orderBy(githubPullRequests.authorLogin),
    db
      .selectDistinct({ authorLogin: githubCommits.authorLogin })
      .from(githubCommits)
      .where(and(eq(githubCommits.productId, id), isNotNull(githubCommits.authorLogin)))
      .orderBy(githubCommits.authorLogin),
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
    db
      .select({
        id: knowledgeDocuments.id,
        title: knowledgeDocuments.title,
        sourceType: knowledgeDocuments.sourceType,
        summary: knowledgeDocuments.summary,
        createdAt: knowledgeDocuments.createdAt,
      })
      .from(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.productId, id), eq(knowledgeDocuments.userId, session.user.id)))
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(20),
    db
      .select({
        id: knowledgeSignals.id,
        kind: knowledgeSignals.kind,
        title: knowledgeSignals.title,
        detail: knowledgeSignals.detail,
        evidence: knowledgeSignals.evidence,
        confidence: knowledgeSignals.confidence,
      })
      .from(knowledgeSignals)
      .where(eq(knowledgeSignals.productId, id))
      .orderBy(desc(knowledgeSignals.createdAt))
      .limit(50),
  ])

  const totalPRs = prTotalRows[0]?.total ?? 0
  const totalCommits = commitTotalRows[0]?.total ?? 0
  const prTotalPages = Math.max(1, Math.ceil(totalPRs / PAGE_SIZE))
  const commitTotalPages = Math.max(1, Math.ceil(totalCommits / PAGE_SIZE))
  const prAuthors = prAuthorRows.map((r) => r.authorLogin).filter(Boolean) as string[]
  const commitAuthors = commitAuthorRows.map((r) => r.authorLogin).filter(Boolean) as string[]

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
            <Badge variant="secondary">{attachedLinearWorkspace ? '1 Linear workspace' : 'No Linear workspace'}</Badge>
            <Badge variant="secondary">{repositories.length} GitHub repos</Badge>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="gap-5">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="work">Work</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
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
                <CardTitle>{totalPRs}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Commits</CardDescription>
                <CardTitle>{totalCommits}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Signals</CardDescription>
                <CardTitle>{knowledgeSignalRows.length}</CardTitle>
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
                {!attachedLinearWorkspace && (
                  <p className="text-muted-foreground">Attach a Linear workspace in Settings.</p>
                )}
                {repositories.length === 0 && (
                  <p className="text-muted-foreground">Attach GitHub repositories in Settings.</p>
                )}
                {suggestedLinks.length > 0 && <p>{suggestedLinks.length} AI-suggested code links need review.</p>}
                {attachedLinearWorkspace && repositories.length > 0 && suggestedLinks.length === 0 && (
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
              <CardDescription>Issues from the Linear workspace attached to this product.</CardDescription>
            </CardHeader>
            <CardContent>
              {issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Attach and sync a Linear workspace to see product-scoped work.
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

        <TabsContent value="knowledge">
          <KnowledgeIngestion productId={id} documents={knowledgeDocumentRows} signals={knowledgeSignalRows} />
        </TabsContent>

        <TabsContent value="code">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitPullRequest className="h-4 w-4" />
                  Pull Requests
                  {totalPRs > 0 && (
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{totalPRs} total</span>
                  )}
                </CardTitle>
                <CardDescription>All PRs from attached repositories.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <PRFilters authors={prAuthors} />
                {pullRequests.length === 0 && prPage === 1 ? (
                  <p className="text-sm text-muted-foreground">
                    {prStateFilter || prAuthorFilter
                      ? 'No pull requests match the current filters.'
                      : 'Attach a repository and sync GitHub to import pull requests.'}
                  </p>
                ) : (
                  <>
                    {pullRequests.map((pullRequest) => (
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
                    ))}
                    <PaginationControls
                      page={prPage}
                      totalPages={prTotalPages}
                      prPage={prPage}
                      commitPage={commitPage}
                      paramName="prPage"
                      productId={id}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitCommit className="h-4 w-4" />
                  Commits
                  {totalCommits > 0 && (
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{totalCommits} total</span>
                  )}
                </CardTitle>
                <CardDescription>All commits imported from the last 90 days.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <CommitFilters authors={commitAuthors} />
                {commits.length === 0 && commitPage === 1 ? (
                  <p className="text-sm text-muted-foreground">
                    {commitAuthorFilter ? 'No commits match the current filters.' : 'No commits imported yet.'}
                  </p>
                ) : (
                  <>
                    {commits.map((commit) => (
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
                    ))}
                    <PaginationControls
                      page={commitPage}
                      totalPages={commitTotalPages}
                      prPage={prPage}
                      commitPage={commitPage}
                      paramName="commitPage"
                      productId={id}
                    />
                  </>
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
            attachedLinearWorkspace={attachedLinearWorkspace}
            githubConnected={githubConnection.connected}
            githubUsername={githubConnection.username}
            repositories={repositoriesWithStats}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
