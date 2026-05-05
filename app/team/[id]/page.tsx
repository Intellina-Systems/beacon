import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { ArrowLeft, ExternalLink, GitCommit, GitPullRequest, ListTodo } from 'lucide-react'
import { db } from '@/lib/db/client'
import { githubCommits, githubPullRequests, linearIssues, members, products } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MemberConnections } from '@/components/members/member-connections'
import { EditMemberDialog } from '@/components/members/edit-member-dialog'

const PRIORITY_LABEL: Record<number, string> = {
  0: 'None',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
}

function formatDate(value: Date | null | undefined) {
  if (!value) return '—'
  return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/')

  const { id } = await params

  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, id), eq(members.userId, session.user.id)))
    .limit(1)

  if (!member) notFound()

  // Linear users available for mapping (from synced issues)
  const linearUserRows = await db
    .selectDistinct({ id: linearIssues.assigneeLinearId, name: linearIssues.assigneeName })
    .from(linearIssues)
    .where(and(eq(linearIssues.userId, session.user.id), isNotNull(linearIssues.assigneeLinearId)))
    .orderBy(linearIssues.assigneeName)

  const availableLinearUsers = linearUserRows.filter((u) => u.id && u.name).map((u) => ({ id: u.id!, name: u.name! }))

  const linearUserName = member.linearUserId
    ? (availableLinearUsers.find((u) => u.id === member.linearUserId)?.name ?? null)
    : null

  // Fetch user's product IDs for scoping GitHub data
  const userProducts = await db.select({ id: products.id }).from(products).where(eq(products.userId, session.user.id))

  const productIds = userProducts.map((p) => p.id)

  const [issues, pullRequests, commits] = await Promise.all([
    member.linearUserId
      ? db
          .select()
          .from(linearIssues)
          .where(and(eq(linearIssues.userId, session.user.id), eq(linearIssues.assigneeLinearId, member.linearUserId)))
          .orderBy(linearIssues.priority, desc(linearIssues.linearUpdatedAt))
          .limit(50)
      : Promise.resolve([]),

    member.githubUsername && productIds.length > 0
      ? db
          .select()
          .from(githubPullRequests)
          .where(
            and(
              inArray(githubPullRequests.productId, productIds),
              eq(githubPullRequests.authorLogin, member.githubUsername),
            ),
          )
          .orderBy(desc(githubPullRequests.githubUpdatedAt))
          .limit(50)
      : Promise.resolve([]),

    member.githubUsername && productIds.length > 0
      ? db
          .select()
          .from(githubCommits)
          .where(
            and(inArray(githubCommits.productId, productIds), eq(githubCommits.authorLogin, member.githubUsername)),
          )
          .orderBy(desc(githubCommits.committedAt))
          .limit(50)
      : Promise.resolve([]),
  ])

  const activeIssues = issues.filter((i) => !['completed', 'cancelled'].includes(i.statusType ?? ''))
  const openPRs = pullRequests.filter((pr) => pr.state === 'open')

  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/team">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Team
          </Link>
        </Button>
      </div>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{member.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[member.role, member.email].filter(Boolean).join(' · ') || 'No details set'}
            </p>
          </div>
        </div>
        <EditMemberDialog
          memberId={member.id}
          name={member.name}
          email={member.email ?? null}
          role={member.role ?? null}
        />
      </div>

      <Tabs defaultValue="overview" className="gap-5">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="linear">Linear</TabsTrigger>
          <TabsTrigger value="github">GitHub</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active Issues</CardDescription>
                <CardTitle>{activeIssues.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Open PRs</CardDescription>
                <CardTitle>{openPRs.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Commits (90d)</CardDescription>
                <CardTitle>{commits.length}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Recent Linear Work</CardTitle>
                <CardDescription>
                  {member.linearUserId ? 'Issues assigned to this member.' : 'Connect a Linear account in Connections.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {issues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No issues found.</p>
                ) : (
                  issues.slice(0, 5).map((issue) => (
                    <div key={issue.id} className="rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-xs text-muted-foreground">{issue.identifier}</span>
                        <Badge variant="outline" className="text-xs">
                          {issue.status}
                        </Badge>
                      </div>
                      <p className="line-clamp-1 mt-0.5">{issue.title}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Recent GitHub Activity</CardTitle>
                <CardDescription>
                  {member.githubUsername
                    ? `@${member.githubUsername} across all products.`
                    : 'Connect a GitHub account in Connections.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {pullRequests.length === 0 && commits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity found.</p>
                ) : (
                  <>
                    {pullRequests.slice(0, 3).map((pr) => (
                      <a
                        key={pr.id}
                        href={pr.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border px-3 py-2 text-sm hover:bg-accent/40 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <GitPullRequest className="h-3 w-3" /> PR #{pr.number}
                          </span>
                          <Badge variant={pr.state === 'open' ? 'default' : 'secondary'} className="text-xs">
                            {pr.state}
                          </Badge>
                        </div>
                        <p className="line-clamp-1 mt-0.5">{pr.title}</p>
                      </a>
                    ))}
                    {commits.slice(0, 2).map((commit) => (
                      <a
                        key={commit.id}
                        href={commit.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border px-3 py-2 text-sm hover:bg-accent/40 transition-colors"
                      >
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <GitCommit className="h-3 w-3" /> commit · {formatDate(commit.committedAt)}
                        </span>
                        <p className="line-clamp-1 mt-0.5">{commit.message.split('\n')[0]}</p>
                      </a>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="linear">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListTodo className="h-4 w-4" />
                Linear Issues
              </CardTitle>
              <CardDescription>
                {member.linearUserId
                  ? `All issues assigned to ${linearUserName ?? member.linearUserId}.`
                  : 'Connect a Linear account in the Connections tab.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No issues found.</p>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Issue</th>
                        <th className="w-32 px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                        <th className="w-24 px-4 py-2.5 text-left font-medium text-muted-foreground">Priority</th>
                        <th className="w-12 px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {issues.map((issue) => (
                        <tr key={issue.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <p className="font-medium text-xs text-muted-foreground">{issue.identifier}</p>
                            <p className="line-clamp-1">{issue.title}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{issue.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{PRIORITY_LABEL[issue.priority ?? 0]}</td>
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

        <TabsContent value="github">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GitPullRequest className="h-4 w-4" />
                  Pull Requests
                </CardTitle>
                <CardDescription>
                  {member.githubUsername
                    ? `PRs authored by @${member.githubUsername}.`
                    : 'Connect a GitHub account in the Connections tab.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {pullRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pull requests found.</p>
                ) : (
                  pullRequests.map((pr) => (
                    <a
                      key={pr.id}
                      href={pr.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border px-3 py-2 text-sm hover:bg-accent/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-1 font-medium">
                            #{pr.number} {pr.title}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDate(pr.githubUpdatedAt)}</p>
                        </div>
                        <Badge variant={pr.state === 'open' ? 'default' : 'secondary'}>{pr.state}</Badge>
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
                <CardDescription>
                  {member.githubUsername
                    ? `Commits by @${member.githubUsername} from the last 90 days.`
                    : 'Connect a GitHub account in the Connections tab.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {commits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No commits found.</p>
                ) : (
                  commits.map((commit) => (
                    <a
                      key={commit.id}
                      href={commit.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border px-3 py-2 text-sm hover:bg-accent/40 transition-colors"
                    >
                      <p className="line-clamp-1 font-medium">{commit.message.split('\n')[0]}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(commit.committedAt)}</p>
                    </a>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="connections">
          <div className="mb-4">
            <h2 className="text-sm font-medium">Connected accounts</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Map this member to their Linear workspace account and GitHub username so their activity shows up here.
            </p>
          </div>
          <MemberConnections
            memberId={member.id}
            githubUsername={member.githubUsername ?? null}
            linearUserId={member.linearUserId ?? null}
            linearUserName={linearUserName}
            availableLinearUsers={availableLinearUsers}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
