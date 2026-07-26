import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { AlertTriangle, ArrowLeft, ExternalLink } from 'lucide-react'
import { db } from '@/lib/db/client'
import { calendarAccounts, members, teamMembers, teams, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { detailVisibleMemberIds, isAdmin } from '@/lib/auth/permissions'
import { getActiveBlockers, getMemberActivity, listEvents } from '@/lib/events/queries'
import { isGoogleConfigured } from '@/lib/google/oauth'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, PageShell, Panel, PanelHeader } from '@/components/page-shell'
import { EventItem } from '@/components/events/event-item'
import { EditMemberDialog } from '@/components/members/edit-member-dialog'
import { MemberConnections } from '@/components/members/member-connections'
import { GoogleCalendarCard } from '@/components/integrations/google-calendar-card'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  blocked: 'Blocked',
}

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const { id } = await params
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, id), eq(members.workspaceId, workspaceId)))
    .limit(1)
  if (!member) notFound()

  const detailVisible = await detailVisibleMemberIds(ctx)
  if (detailVisible && !detailVisible.includes(member.id)) redirect('/team')

  const memberTeams = await db
    .select({ name: teams.name, isLead: teamMembers.isLead })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.memberId, member.id))
    .orderBy(teams.name)

  const [recentEvents, assignedItems, allBlockers, activityByMember] = await Promise.all([
    listEvents(workspaceId, { memberId: member.id, sinceDays: 30, limit: 40 }),
    db
      .select({
        id: workItems.id,
        key: workItems.key,
        title: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        externalUrl: workItems.externalUrl,
      })
      .from(workItems)
      .where(
        and(
          eq(workItems.workspaceId, workspaceId),
          eq(workItems.assigneeMemberId, member.id),
          inArray(workItems.status, ['backlog', 'todo', 'in_progress', 'in_review', 'blocked']),
        ),
      )
      .orderBy(desc(workItems.updatedAt))
      .limit(30),
    getActiveBlockers(workspaceId),
    getMemberActivity(workspaceId, 7),
  ])

  // A personal calendar connection is only shown on your own profile.
  const isSelf = member.id === ctx.member.id
  const calendarAccount = isSelf
    ? ((
        await db
          .select({ externalEmail: calendarAccounts.externalEmail, lastSyncedAt: calendarAccounts.lastSyncedAt })
          .from(calendarAccounts)
          .where(and(eq(calendarAccounts.workspaceId, workspaceId), eq(calendarAccounts.memberId, member.id)))
          .limit(1)
      )[0] ?? null)
    : null

  const memberBlockers = allBlockers.filter((blocker) => blocker.member?.id === member.id)
  const weekActivity = activityByMember.get(member.id)

  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <PageShell
      title={member.name}
      description={[member.title, member.email].filter(Boolean).join(' · ') || undefined}
      actions={
        <>
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/team">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Team
            </Link>
          </Button>
          {isAdmin(ctx) && (
            <EditMemberDialog
              memberId={member.id}
              name={member.name}
              email={member.email}
              title={member.title}
              accessRole={member.accessRole}
              showAccessRole={member.status !== 'profile'}
              isSelf={member.id === ctx.member.id}
            />
          )}
        </>
      }
    >
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 lg:px-6">
        <div className="flex items-center gap-4 rounded-lg border bg-card px-4 py-4">
          <Avatar className="h-14 w-14 border">
            <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-sm font-medium">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-lg font-semibold tracking-tight">
              {member.name}
              {member.status !== 'profile' && (
                <span className="rounded border border-beacon/40 bg-beacon/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-beacon">
                  {member.accessRole}
                </span>
              )}
              {member.status === 'invited' && (
                <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  invited
                </span>
              )}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {[member.title, member.email].filter(Boolean).join(' · ') || 'No details yet'}
            </p>
            {memberTeams.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {memberTeams.map((team) => (
                  <span
                    key={team.name}
                    className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {team.name}
                    {team.isLead ? ' · lead' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{weekActivity?.total ?? 0}</p>
            <p className="micro-label">events · 7d</p>
          </div>
        </div>

        {memberBlockers.length > 0 && (
          <Panel className="border-destructive/40">
            <PanelHeader
              label={
                <span className="flex items-center gap-1.5 text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Currently blocked
                </span>
              }
            />
            <div className="space-y-2 px-4 py-3">
              {memberBlockers.map((blocker) => (
                <p key={blocker.event.id} className="text-sm leading-snug">
                  {blocker.event.summary}
                </p>
              ))}
            </div>
          </Panel>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Panel>
            <PanelHeader label="Assigned work" meta={<span className="tabular-nums">{assignedItems.length}</span>} />
            <div className="divide-y px-4">
              {assignedItems.length === 0 ? (
                <EmptyState title="No active assigned work" />
              ) : (
                assignedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 py-2.5 text-sm">
                    {item.key && <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>}
                    <span className="flex-1 truncate">{item.title}</span>
                    <Badge
                      variant={item.status === 'blocked' ? 'destructive' : 'outline'}
                      className="shrink-0 px-1.5 py-0 font-mono text-[10px]"
                    >
                      {STATUS_LABEL[item.status] ?? item.status}
                    </Badge>
                    {item.externalUrl && (
                      <a
                        href={item.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Open in tracker"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader label="Recent activity · 30d" />
            <div className="divide-y px-4">
              {recentEvents.length === 0 ? (
                <EmptyState
                  title="No events attributed yet"
                  hint={`Link identities below so signals resolve to ${member.name}.`}
                />
              ) : (
                recentEvents.slice(0, 15).map((event) => <EventItem key={event.id} event={event} />)
              )}
            </div>
          </Panel>
        </div>

        {isSelf && (
          <GoogleCalendarCard
            configured={isGoogleConfigured()}
            connected={Boolean(calendarAccount)}
            email={calendarAccount?.externalEmail ?? null}
            lastSyncedAt={calendarAccount?.lastSyncedAt ?? null}
          />
        )}

        <MemberConnections memberId={member.id} githubUsername={member.githubUsername} />
      </div>
    </PageShell>
  )
}
