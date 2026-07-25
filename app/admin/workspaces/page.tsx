import Link from 'next/link'
import { redirect } from 'next/navigation'
import { count, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, workspaces } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { isSuperAdminUser } from '@/lib/auth/permissions'
import { PageShell } from '@/components/page-shell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin · Workspaces' }

export default async function AdminWorkspacesPage() {
  const session = await getServerSession()
  if (!session?.user || !(await isSuperAdminUser(session.user.id))) redirect('/')

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      issuePrefix: workspaces.issuePrefix,
      createdAt: workspaces.createdAt,
      memberCount: count(members.id),
    })
    .from(workspaces)
    .leftJoin(members, eq(members.workspaceId, workspaces.id))
    .groupBy(workspaces.id)
    .orderBy(workspaces.createdAt)

  return (
    <PageShell title="Workspaces" description={`${rows.length} workspace${rows.length === 1 ? '' : 's'} · all orgs`}>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 lg:px-6">
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="micro-label px-4 py-2.5 text-left font-medium">Workspace</th>
                <th className="micro-label w-24 px-4 py-2.5 text-left font-medium">Prefix</th>
                <th className="micro-label w-28 px-4 py-2.5 text-right font-medium">Members</th>
                <th className="micro-label w-40 px-4 py-2.5 text-right font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="relative transition-colors hover:bg-accent/40">
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/admin/workspaces/${row.id}`} className="after:absolute after:inset-0">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{row.issuePrefix}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.memberCount}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                    {row.createdAt.toLocaleDateString()}
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
