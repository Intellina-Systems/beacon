import { redirect } from 'next/navigation'
import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { Zap } from 'lucide-react'
import { db } from '@/lib/db/client'
import { linearConnections, linearIssues } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getIssueBucket, type IssueBucket } from '@/lib/linear/issue-bucket'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IssuesSyncButton } from '@/components/issues-sync-button'
import { IssuesBoard, type IssueBoardItem } from '@/components/issues/board'

export default async function IssuesPage() {
  const session = await getServerSession()
  if (!session?.user) {
    redirect('/')
  }

  const userId = session.user.id

  const [connection, issues] = await Promise.all([
    db.select().from(linearConnections).where(eq(linearConnections.userId, userId)).limit(1),
    db
      .select()
      .from(linearIssues)
      .where(eq(linearIssues.userId, userId))
      .orderBy(linearIssues.priority, desc(linearIssues.linearUpdatedAt), desc(linearIssues.updatedAt)),
  ])

  const linearConnection = connection[0] ?? null

  const buckets: Record<IssueBucket, IssueBoardItem[]> = {
    todo: [],
    inProgress: [],
    completed: [],
    backlog: [],
  }

  for (const issue of issues) {
    buckets[getIssueBucket(issue.statusType, issue.status)].push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      linearUrl: issue.linearUrl,
      projectName: issue.projectName,
      assigneeName: issue.assigneeName,
      priority: issue.priority,
    })
  }

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Issues</h1>
          {linearConnection ? (
            <p className="text-sm text-muted-foreground mt-1">
              Connected to{' '}
              <span className="font-medium">{linearConnection.workspaceName ?? linearConnection.workspaceSlug}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">Connect Linear to sync your workspace issues.</p>
          )}
        </div>
        {linearConnection && issues.length === 0 ? (
          <IssuesSyncButton />
        ) : (
          !linearConnection && (
            <Button asChild>
              <Link href="/api/auth/linear/signin">
                <Zap className="h-4 w-4 mr-2" />
                Connect Linear
              </Link>
            </Button>
          )
        )}
      </div>

      {!linearConnection && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Zap className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Connect Linear to get started</p>
              <p className="text-sm text-muted-foreground mt-1">
                Sync all issues from your workspace and review them by status.
              </p>
            </div>
            <Button asChild>
              <Link href="/api/auth/linear/signin">
                <Zap className="h-4 w-4 mr-2" />
                Connect Linear
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {linearConnection && issues.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div>
              <p className="font-medium">No issues cached yet</p>
              <p className="text-sm text-muted-foreground mt-1">Click sync to import all issues from Linear.</p>
            </div>
            <IssuesSyncButton />
          </CardContent>
        </Card>
      )}

      {linearConnection && issues.length > 0 && <IssuesBoard buckets={buckets} />}
    </div>
  )
}
