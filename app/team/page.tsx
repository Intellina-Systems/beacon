import Link from 'next/link'
import { redirect } from 'next/navigation'
import { count, eq } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { getMemberActivity } from '@/lib/events/queries'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AddMemberButton } from '@/components/add-member-button'
import { EmptyState, PageShell } from '@/components/page-shell'
import { Pagination, parsePage } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Team' }

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
  const session = await getServerSession()
  if (!session?.user) redirect('/')
  const userId = session.user.id

  const page = parsePage((await searchParams).page)

  const [teamMembers, [{ value: total }], activity] = await Promise.all([
    db
      .select()
      .from(members)
      .where(eq(members.userId, userId))
      .orderBy(members.name)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(members).where(eq(members.userId, userId)),
    getMemberActivity(userId, 7),
  ])
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <PageShell title="Team" description={`${total} member${total === 1 ? '' : 's'}`} actions={<AddMemberButton />}>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 lg:px-6">
        {teamMembers.length === 0 ? (
          <div className="flex rounded-lg border border-dashed">
            <EmptyState
              title="No team members yet"
              hint="Connect Linear and sync to import your workspace members, or add them manually."
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="micro-label px-4 py-2.5 text-left font-medium">Member</th>
                  <th className="micro-label hidden w-40 px-4 py-2.5 text-left font-medium sm:table-cell">Role</th>
                  <th className="micro-label hidden w-52 px-4 py-2.5 text-left font-medium lg:table-cell">Email</th>
                  <th className="micro-label w-40 px-4 py-2.5 text-left font-medium">Identities</th>
                  <th className="micro-label w-28 px-4 py-2.5 text-right font-medium">7d activity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {teamMembers.map((member) => {
                  const memberActivity = activity.get(member.id)
                  return (
                    <tr key={member.id} className="relative transition-colors hover:bg-accent/40">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/team/${member.id}`}
                          className="flex items-center gap-3 after:absolute after:inset-0"
                        >
                          <Avatar className="h-7 w-7 border">
                            <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                            <AvatarFallback className="text-[10px] font-medium">{initials(member.name)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{member.name}</span>
                        </Link>
                      </td>
                      <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">
                        {member.role ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="hidden truncate px-4 py-2.5 text-xs text-muted-foreground lg:table-cell">
                        {member.email ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {member.githubUsername && (
                            <span className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              gh:{member.githubUsername}
                            </span>
                          )}
                          {member.linearUserId && (
                            <span className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              linear
                            </span>
                          )}
                          {!member.githubUsername && !member.linearUserId && (
                            <span className="text-xs text-muted-foreground/50">unlinked</span>
                          )}
                        </div>
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-right font-mono text-xs tabular-nums',
                          memberActivity ? 'text-foreground/80' : 'text-muted-foreground/50',
                        )}
                      >
                        {memberActivity ? `${memberActivity.total} ev` : 'quiet'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          hrefFor={(p) => (p > 1 ? `/team?page=${p}` : '/team')}
          className="mt-2"
        />
      </div>
    </PageShell>
  )
}
