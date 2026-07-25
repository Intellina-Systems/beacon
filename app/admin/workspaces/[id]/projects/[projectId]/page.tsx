import { notFound, redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, projects, workItems, workspaces } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { isSuperAdminUser } from '@/lib/auth/permissions'
import { PageShell } from '@/components/page-shell'
import { AdminBreadcrumb } from '@/components/admin/breadcrumb'
import { STATUS_META } from '@/lib/work-items/constants'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin · Project' }

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>
}) {
  const session = await getServerSession()
  if (!session?.user || !(await isSuperAdminUser(session.user.id))) redirect('/')

  const { id, projectId } = await params
  const [[project], [workspace]] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
    db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, id)).limit(1),
  ])
  if (!project || project.workspaceId !== id || !workspace) notFound()

  const items = await db
    .select({
      id: workItems.id,
      key: workItems.key,
      title: workItems.title,
      status: workItems.status,
      updatedAt: workItems.updatedAt,
      assigneeName: members.name,
    })
    .from(workItems)
    .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
    .where(eq(workItems.projectId, projectId))
    .orderBy(desc(workItems.updatedAt))

  return (
    <PageShell
      title={
        <AdminBreadcrumb
          crumbs={[
            { label: 'Workspaces', href: '/admin/workspaces' },
            { label: workspace.name, href: `/admin/workspaces/${id}` },
            { label: project.name },
          ]}
        />
      }
      description={`${items.length} work item${items.length === 1 ? '' : 's'}`}
    >
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 lg:px-6">
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="micro-label w-24 px-4 py-2.5 text-left font-medium">Key</th>
                <th className="micro-label px-4 py-2.5 text-left font-medium">Title</th>
                <th className="micro-label w-32 px-4 py-2.5 text-left font-medium">Status</th>
                <th className="micro-label w-40 px-4 py-2.5 text-left font-medium">Assignee</th>
                <th className="micro-label w-40 px-4 py-2.5 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 text-muted-foreground">{item.key ?? '—'}</td>
                  <td className="px-4 py-2.5 font-medium">{item.title}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[item.status].tone}`} />
                      {STATUS_META[item.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{item.assigneeName ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                    {item.updatedAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  )
}
