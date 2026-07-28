import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { ArrowLeft, Crown } from 'lucide-react'
import { db } from '@/lib/db/client'
import { members, teamMembers, teams, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canViewAllTeams, detailVisibleMemberIds, visibleMemberIds } from '@/lib/auth/permissions'
import { OPEN_STATUSES } from '@/lib/work-items/constants'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, PageShell, Panel, PanelHeader } from '@/components/page-shell'
import { OrgDocumentsPanel } from '@/components/knowledge/org-documents-panel'
import { OpenWorkList } from '@/components/work-items/open-work-list'

export const dynamic = 'force-dynamic'

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const { id } = await params
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.workspaceId, workspaceId)))
    .limit(1)
  if (!team) notFound()

  // Non-admins are scoped to their own teams — same rule the /org and /team
  // list pages already enforce, applied here so a team's page can't be
  // reached directly by id guessing.
  if (!canViewAllTeams(ctx) && !ctx.teams.some((t) => t.id === id)) redirect('/org')

  const [teamMemberRows, detailVisible, openItems, fullRoster, visible] = await Promise.all([
    db
      .select({
        id: members.id,
        name: members.name,
        avatarUrl: members.avatarUrl,
        isLead: teamMembers.isLead,
      })
      .from(teamMembers)
      .innerJoin(members, eq(members.id, teamMembers.memberId))
      .where(eq(teamMembers.teamId, id))
      .orderBy(members.name),
    detailVisibleMemberIds(ctx),
    db
      .select({
        id: workItems.id,
        key: workItems.key,
        title: workItems.title,
        status: workItems.status,
        externalUrl: workItems.externalUrl,
      })
      .from(workItems)
      .where(
        and(eq(workItems.workspaceId, workspaceId), eq(workItems.teamId, id), inArray(workItems.status, OPEN_STATUSES)),
      )
      .orderBy(desc(workItems.updatedAt))
      .limit(30),
    db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.name),
    visibleMemberIds(ctx),
  ])
  // Same scoping the /work board applies to its assignee picker.
  const roster = visible ? fullRoster.filter((m) => visible.includes(m.id)) : fullRoster

  return (
    <PageShell
      title={team.name}
      description={team.description ?? undefined}
      actions={
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/org">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Org
          </Link>
        </Button>
      }
      fixed
    >
      <div className="flex h-full w-full flex-col gap-5 px-4 py-5 lg:px-6">
        <div className="flex shrink-0 items-center gap-3 rounded-lg border bg-card px-4 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-lg font-semibold tracking-tight">
              {team.name}
              {team.kind === 'non_technical' && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  non-tech
                </Badge>
              )}
            </p>
            <p className="truncate text-sm text-muted-foreground">{team.description ?? 'No description yet'}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{teamMemberRows.length}</p>
            <p className="micro-label">members</p>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <Panel>
            <PanelHeader label="Members" meta={<span className="tabular-nums">{teamMemberRows.length}</span>} />
            <div className="min-h-0 flex-1 divide-y overflow-y-auto px-4">
              {teamMemberRows.length === 0 ? (
                <EmptyState title="No members yet" />
              ) : (
                teamMemberRows.map((member) => {
                  const canOpen = !detailVisible || detailVisible.includes(member.id)
                  const row = (
                    <div className="flex items-center gap-3 py-2.5 text-sm">
                      <Avatar className="h-7 w-7 border">
                        <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                        <AvatarFallback className="text-[10px] font-medium">{initials(member.name)}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate font-medium">{member.name}</span>
                      {member.isLead && (
                        <span className="flex items-center gap-1 rounded border border-beacon/40 bg-beacon/10 px-1.5 py-0.5 text-[10px] font-medium text-beacon">
                          <Crown className="h-3 w-3" />
                          Lead
                        </span>
                      )}
                    </div>
                  )
                  return canOpen ? (
                    <Link key={member.id} href={`/team/${member.id}`} className="-mx-4 block px-4 hover:bg-accent/40">
                      {row}
                    </Link>
                  ) : (
                    <div key={member.id}>{row}</div>
                  )
                })
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader label="Open work" meta={<span className="tabular-nums">{openItems.length}</span>} />
            <OpenWorkList
              items={openItems}
              roster={roster}
              currentMemberId={ctx.member.id}
              emptyLabel="No open work tagged to this team"
            />
          </Panel>

          <OrgDocumentsPanel teamId={team.id} scopeLabel={team.name} />
        </div>
      </div>
    </PageShell>
  )
}
