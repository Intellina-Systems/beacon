import Link from 'next/link'
import { redirect } from 'next/navigation'
import { count, eq } from 'drizzle-orm'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canViewAllTeams, detailVisibleMemberIds, isAdmin } from '@/lib/auth/permissions'
import { TeamsSection, type TeamWithMembers } from '@/components/teams/teams-section'
import { db } from '@/lib/db/client'
import { members, teamMembers, teams } from '@/lib/db/schema'
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
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const page = parsePage((await searchParams).page)

  const detailVisible = await detailVisibleMemberIds(ctx)
  const [pageMembers, [{ value: total }], activity, teamRows, fullRoster] = await Promise.all([
    db
      .select()
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.name)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(members).where(eq(members.workspaceId, workspaceId)),
    getMemberActivity(workspaceId, 7, detailVisible),
    db
      .select({
        id: teams.id,
        name: teams.name,
        description: teams.description,
        kind: teams.kind,
        memberId: teamMembers.memberId,
        memberName: members.name,
        memberAvatarUrl: members.avatarUrl,
        isLead: teamMembers.isLead,
      })
      .from(teams)
      .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
      .leftJoin(members, eq(members.id, teamMembers.memberId))
      .where(eq(teams.workspaceId, workspaceId))
      .orderBy(teams.name),
    db
      .select({ id: members.id, name: members.name, avatarUrl: members.avatarUrl })
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.name),
  ])

  const teamsById = new Map<string, TeamWithMembers>()
  for (const row of teamRows) {
    const team = teamsById.get(row.id) ?? {
      id: row.id,
      name: row.name,
      description: row.description,
      kind: row.kind,
      members: [],
    }
    if (row.memberId && row.memberName !== null) {
      team.members.push({
        id: row.memberId,
        name: row.memberName,
        avatarUrl: row.memberAvatarUrl,
        isLead: !!row.isLead,
      })
    }
    teamsById.set(row.id, team)
  }
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Admins/managers see the whole company's teams; everyone else only sees
  // the team(s) they're actually on — same "don't overwhelm the employee"
  // rule as the Org page, reusing the visibility split already used
  // elsewhere in the app (lib/auth/permissions.ts).
  const allTeams = [...teamsById.values()]
  const visibleTeams = canViewAllTeams(ctx)
    ? allTeams
    : allTeams.filter((t) => t.members.some((m) => m.id === ctx.member.id))

  return (
    <PageShell
      title="Team"
      description={`${total} member${total === 1 ? '' : 's'}`}
      actions={isAdmin(ctx) ? <AddMemberButton teams={allTeams.map((t) => ({ id: t.id, name: t.name }))} /> : undefined}
    >
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 lg:px-6">
        <TeamsSection
          teams={visibleTeams}
          roster={fullRoster}
          canManage={isAdmin(ctx)}
          scopedToSelf={!canViewAllTeams(ctx)}
        />
        {pageMembers.length === 0 ? (
          <div className="flex rounded-lg border border-dashed">
            <EmptyState
              title="No team members yet"
              hint="Connect GitHub and sync to import your workspace members, or add them manually."
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="micro-label px-4 py-2.5 text-left font-medium">Member</th>
                  <th className="micro-label hidden w-40 px-4 py-2.5 text-left font-medium sm:table-cell">Title</th>
                  <th className="micro-label hidden w-28 px-4 py-2.5 text-left font-medium sm:table-cell">Access</th>
                  <th className="micro-label hidden w-52 px-4 py-2.5 text-left font-medium lg:table-cell">Email</th>
                  <th className="micro-label w-40 px-4 py-2.5 text-left font-medium">Identities</th>
                  <th className="micro-label w-28 px-4 py-2.5 text-right font-medium">7d activity</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageMembers.map((member) => {
                  const canOpen = !detailVisible || detailVisible.includes(member.id)
                  const memberActivity = canOpen ? activity.get(member.id) : undefined
                  return (
                    <tr key={member.id} className="relative transition-colors hover:bg-accent/40">
                      <td className="px-4 py-2.5">
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
                      </td>
                      <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">
                        {member.title ?? <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
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
                          {!member.githubUsername && <span className="text-xs text-muted-foreground/50">unlinked</span>}
                        </div>
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-right font-mono text-xs tabular-nums',
                          memberActivity ? 'text-foreground/80' : 'text-muted-foreground/50',
                        )}
                      >
                        {canOpen ? (memberActivity ? `${memberActivity.total} ev` : 'quiet') : '—'}
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
