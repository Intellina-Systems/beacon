import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { Zap } from 'lucide-react'
import { db } from '@/lib/db/client'
import { linearIssues } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getIssueBucket, type IssueBucket } from '@/lib/linear/issue-bucket'
import { ensureLinearConnection } from '@/lib/linear/ensure-linear-connection'
import { Card, CardContent } from '@/components/ui/card'
import { IssuesSyncButton } from '@/components/issues-sync-button'
import { IssuesBoard, type IssueBoardItem } from '@/components/issues/board'

export default async function IssuesPage() {
  const session = await getServerSession()
  if (!session?.user) {
    redirect('/')
  }

  const userId = session.user.id

  const [linearConnection, issues] = await Promise.all([
    ensureLinearConnection(userId, { requireConnection: true, validateToken: true }),
    db
      .select()
      .from(linearIssues)
      .where(eq(linearIssues.userId, userId))
      .orderBy(linearIssues.priority, desc(linearIssues.linearUpdatedAt), desc(linearIssues.updatedAt)),
  ])

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
            <p className="text-sm text-muted-foreground mt-1">Redirecting to Linear…</p>
          )}
        </div>
        {linearConnection && issues.length === 0 ? <IssuesSyncButton /> : null}
      </div>

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
