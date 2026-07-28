import Link from 'next/link'
import { redirect } from 'next/navigation'
import { count, eq } from 'drizzle-orm'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { detailVisibleMemberIds, isAdmin } from '@/lib/auth/permissions'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { getMemberActivity } from '@/lib/events/queries'
import { listTeamOptions } from '@/lib/org/list'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AddMemberButton } from '@/components/add-member-button'
import { PendingInvitesButton } from '@/components/invites/pending-invites-button'
import { EmptyState, PageShell } from '@/components/page-shell'
import { Pagination, parsePage } from '@/components/ui/pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'People' }

const PAGE_SIZE = 25

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const page = parsePage((await searchParams).page)

  const detailVisible = await detailVisibleMemberIds(ctx)
  const [pageMembers, [{ value: total }], activity, teamOptions] = await Promise.all([
    db
      .select()
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.name)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(members).where(eq(members.workspaceId, workspaceId)),
    getMemberActivity(workspaceId, 7, detailVisible),
    listTeamOptions(workspaceId),
  ])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <PageShell
      title="People"
      description={`${total} member${total === 1 ? '' : 's'}`}
      actions={
        isAdmin(ctx) ? (
          <div className="flex items-center gap-2">
            <PendingInvitesButton />
            <AddMemberButton teams={teamOptions} />
          </div>
        ) : undefined
      }
      fixed
    >
      <div className="flex h-full w-full flex-col gap-3 px-4 py-5 lg:px-6">
        {pageMembers.length === 0 ? (
          <div className="flex flex-1 rounded-lg border border-dashed">
            <EmptyState
              title="No team members yet"
              hint="Connect GitHub and sync to import your workspace members, or add them manually."
            />
          </div>
        ) : (
          <div className="scrollbar-hide min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-muted">
                  <TableHead className="micro-label px-4 py-2.5 font-medium">Member</TableHead>
                  <TableHead className="micro-label hidden w-40 px-4 py-2.5 font-medium sm:table-cell">Title</TableHead>
                  <TableHead className="micro-label hidden w-28 px-4 py-2.5 font-medium sm:table-cell">
                    Access
                  </TableHead>
                  <TableHead className="micro-label hidden w-52 px-4 py-2.5 font-medium lg:table-cell">Email</TableHead>
                  <TableHead className="micro-label w-40 px-4 py-2.5 font-medium">Identities</TableHead>
                  <TableHead className="micro-label w-28 px-4 py-2.5 text-right font-medium">7d activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y">
                {pageMembers.map((member) => {
                  const canOpen = !detailVisible || detailVisible.includes(member.id)
                  const memberActivity = canOpen ? activity.get(member.id) : undefined
                  return (
                    <TableRow key={member.id} className="relative">
                      <TableCell className="px-4 py-2.5">
                        {canOpen ? (
                          <Link
                            href={`/team/${member.id}`}
                            className="flex items-center gap-3 after:absolute after:inset-0"
                          >
                            <Avatar className="h-7 w-7 border">
                              <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                              <AvatarFallback className="text-[10px] font-medium">
                                {initials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{member.name}</span>
                          </Link>
                        ) : (
                          <span className="flex items-center gap-3">
                            <Avatar className="h-7 w-7 border">
                              <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                              <AvatarFallback className="text-[10px] font-medium">
                                {initials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{member.name}</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">
                        {member.title ?? <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="hidden px-4 py-2.5 sm:table-cell">
                        {member.status === 'profile' ? (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1">
                            <span className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {member.accessRole}
                            </span>
                            {member.status === 'invited' && (
                              <span className="rounded border border-beacon/40 bg-beacon/10 px-1.5 py-0.5 font-mono text-[10px] text-beacon">
                                invited
                              </span>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden truncate px-4 py-2.5 text-xs text-muted-foreground lg:table-cell">
                        {member.email ?? <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {member.githubUsername && (
                            <span className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              gh:{member.githubUsername}
                            </span>
                          )}
                          {!member.githubUsername && <span className="text-xs text-muted-foreground/50">unlinked</span>}
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          'px-4 py-2.5 text-right font-mono text-xs tabular-nums',
                          memberActivity ? 'text-foreground/80' : 'text-muted-foreground/50',
                        )}
                      >
                        {canOpen ? (memberActivity ? `${memberActivity.total} ev` : 'quiet') : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          hrefFor={(p) => (p > 1 ? `/team?page=${p}` : '/team')}
          className="shrink-0"
        />
      </div>
    </PageShell>
  )
}
