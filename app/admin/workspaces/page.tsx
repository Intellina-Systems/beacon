import Link from 'next/link'
import { redirect } from 'next/navigation'
import { count, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, workspaces } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { isSuperAdminUser } from '@/lib/auth/permissions'
import { PageShell } from '@/components/page-shell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
    <PageShell
      title="Workspaces"
      description={`${rows.length} workspace${rows.length === 1 ? '' : 's'} · all orgs`}
      fixed
    >
      <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 lg:px-6">
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="micro-label px-4 py-2.5 font-medium">Workspace</TableHead>
                <TableHead className="micro-label w-24 px-4 py-2.5 font-medium">Prefix</TableHead>
                <TableHead className="micro-label w-28 px-4 py-2.5 text-right font-medium">Members</TableHead>
                <TableHead className="micro-label w-40 px-4 py-2.5 text-right font-medium">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y">
              {rows.map((row) => (
                <TableRow key={row.id} className="relative">
                  <TableCell className="px-4 py-2.5 font-medium">
                    <Link href={`/admin/workspaces/${row.id}`} className="after:absolute after:inset-0">
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-muted-foreground">{row.issuePrefix}</TableCell>
                  <TableCell className="px-4 py-2.5 text-right tabular-nums">{row.memberCount}</TableCell>
                  <TableCell className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                    {row.createdAt.toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageShell>
  )
}
