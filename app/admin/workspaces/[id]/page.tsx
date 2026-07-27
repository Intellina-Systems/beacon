import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { count, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, projects, teams, workItems, workspaces } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { isSuperAdminUser } from '@/lib/auth/permissions'
import { PageShell } from '@/components/page-shell'
import { DeleteWorkspaceDialog } from '@/components/admin/delete-workspace-dialog'
import { AdminBreadcrumb } from '@/components/admin/breadcrumb'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin · Workspace' }

export default async function AdminWorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session?.user || !(await isSuperAdminUser(session.user.id))) redirect('/')

  const { id } = await params
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1)
  if (!workspace) notFound()

  const [[{ value: memberCount }], [{ value: teamCount }], projectRows] = await Promise.all([
    db.select({ value: count() }).from(members).where(eq(members.workspaceId, id)),
    db.select({ value: count() }).from(teams).where(eq(teams.workspaceId, id)),
    db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        itemCount: count(workItems.id),
      })
      .from(projects)
      .leftJoin(workItems, eq(workItems.projectId, projects.id))
      .where(eq(projects.workspaceId, id))
      .groupBy(projects.id)
      .orderBy(projects.name),
  ])

  return (
    <PageShell
      title={
        <AdminBreadcrumb crumbs={[{ label: 'Workspaces', href: '/admin/workspaces' }, { label: workspace.name }]} />
      }
      description={`${memberCount} member${memberCount === 1 ? '' : 's'} · ${teamCount} team${teamCount === 1 ? '' : 's'}`}
      actions={<DeleteWorkspaceDialog workspaceId={workspace.id} workspaceName={workspace.name} />}
    >
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 lg:px-6">
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="micro-label px-4 py-2.5 font-medium">Project</TableHead>
                <TableHead className="micro-label w-32 px-4 py-2.5 font-medium">Status</TableHead>
                <TableHead className="micro-label w-28 px-4 py-2.5 text-right font-medium">Work items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y">
              {projectRows.map((project) => (
                <TableRow key={project.id} className="relative">
                  <TableCell className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/admin/workspaces/${id}/projects/${project.id}`}
                      className="after:absolute after:inset-0"
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-muted-foreground capitalize">{project.status}</TableCell>
                  <TableCell className="px-4 py-2.5 text-right tabular-nums">{project.itemCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageShell>
  )
}
