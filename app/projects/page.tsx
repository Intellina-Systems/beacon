import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { projects, linearConnections, workItems } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FolderKanban, Zap, RefreshCw, ChevronRight } from 'lucide-react'
import { ProjectsSyncButton } from '@/components/projects-sync-button'

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ linear_connected?: string; error?: string }>
}) {
  const session = await getServerSession()
  if (!session?.user) {
    redirect('/')
  }

  const userId = session.user.id
  const params = await searchParams

  // Check Linear connection
  const [connection] = await db.select().from(linearConnections).where(eq(linearConnections.userId, userId)).limit(1)

  // Get projects with issue counts
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      linearProjectId: projects.linearProjectId,
      updatedAt: projects.updatedAt,
      issueCount: sql<number>`(select count(*) from work_items where work_items.project_id = ${projects.id} and (work_items.status_type is null or work_items.status_type not in ('completed','cancelled')))::int`,
    })
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(projects.updatedAt)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          {connection && (
            <p className="text-sm text-muted-foreground mt-1">
              Connected to <span className="font-medium">{connection.workspaceName ?? connection.workspaceSlug}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connection && <ProjectsSyncButton />}
          {!connection && (
            <Button asChild>
              <Link href="/api/auth/linear/signin">
                <Zap className="h-4 w-4 mr-2" />
                Connect Linear
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Toast messages */}
      {params.linear_connected && (
        <div className="mb-6 p-3 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 text-sm">
          Linear connected. Click &ldquo;Sync&rdquo; to import your projects and issues.
        </div>
      )}
      {params.error && (
        <div className="mb-6 p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">
          {params.error === 'linear_not_configured' &&
            'Linear OAuth is not configured. Set LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET.'}
          {params.error === 'linear_denied' && 'Linear authorization was denied.'}
          {params.error === 'linear_token_failed' && 'Failed to obtain Linear access token.'}
          {params.error === 'linear_failed' && 'Linear connection failed. Please try again.'}
          {!['linear_not_configured', 'linear_denied', 'linear_token_failed', 'linear_failed'].includes(params.error) &&
            'Something went wrong. Please try again.'}
        </div>
      )}

      {/* No Linear connection CTA */}
      {!connection && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Zap className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Connect Linear to get started</p>
              <p className="text-sm text-muted-foreground mt-1">
                Sync your projects and issues from Linear, then use Beacon to capture signals and surface insights.
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

      {/* Projects list */}
      {connection && projectRows.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <FolderKanban className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No projects yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click &ldquo;Sync&rdquo; to import your projects from Linear.
              </p>
            </div>
            <ProjectsSyncButton />
          </CardContent>
        </Card>
      )}

      {projectRows.length > 0 && (
        <div className="grid gap-3">
          {projectRows.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:bg-accent/30 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base font-medium">{project.name}</CardTitle>
                      {project.description && (
                        <CardDescription className="mt-1 line-clamp-2">{project.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="secondary">{project.issueCount} issues</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
