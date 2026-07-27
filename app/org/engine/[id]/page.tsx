import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { ArrowLeft, Crown, ExternalLink } from 'lucide-react'
import { db } from '@/lib/db/client'
import { engineMembers, engines, members, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { detailVisibleMemberIds } from '@/lib/auth/permissions'
import { OPEN_STATUSES, STATUS_META } from '@/lib/work-items/constants'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, PageShell, Panel, PanelHeader } from '@/components/page-shell'

export const dynamic = 'force-dynamic'

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default async function EngineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const { id } = await params
  const [engine] = await db
    .select({
      id: engines.id,
      name: engines.name,
      description: engines.description,
      ownerMemberId: engines.ownerMemberId,
      ownerName: members.name,
    })
    .from(engines)
    .leftJoin(members, eq(members.id, engines.ownerMemberId))
    .where(and(eq(engines.id, id), eq(engines.workspaceId, workspaceId)))
    .limit(1)
  if (!engine) notFound()

  const [engineMemberRows, detailVisible, openItems] = await Promise.all([
    db
      .select({ id: members.id, name: members.name, avatarUrl: members.avatarUrl })
      .from(engineMembers)
      .innerJoin(members, eq(members.id, engineMembers.memberId))
      .where(eq(engineMembers.engineId, id))
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
        and(eq(workItems.workspaceId, workspaceId), eq(workItems.engineId, id), inArray(workItems.status, OPEN_STATUSES)),
      )
      .orderBy(desc(workItems.updatedAt))
      .limit(30),
  ])

  return (
    <PageShell
      title={engine.name}
      description={engine.description ?? undefined}
      actions={
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/org">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Org
          </Link>
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 lg:px-6">
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight">{engine.name}</p>
            <p className="truncate text-sm text-muted-foreground">{engine.description ?? 'No description yet'}</p>
            {engine.ownerName && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Crown className="h-3 w-3 text-beacon" />
                {engine.ownerName} · lead
              </p>
            )}
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{engineMemberRows.length}</p>
            <p className="micro-label">members</p>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Panel>
            <PanelHeader label="Members" meta={<span className="tabular-nums">{engineMemberRows.length}</span>} />
            <div className="divide-y px-4">
              {engineMemberRows.length === 0 ? (
                <EmptyState title="No members yet" />
              ) : (
                engineMemberRows.map((member) => {
                  const canOpen = !detailVisible || detailVisible.includes(member.id)
                  const row = (
                    <div className="flex items-center gap-3 py-2.5 text-sm">
                      <Avatar className="h-7 w-7 border">
                        <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                        <AvatarFallback className="text-[10px] font-medium">{initials(member.name)}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate font-medium">{member.name}</span>
                      {member.id === engine.ownerMemberId && (
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
            <div className="divide-y px-4">
              {openItems.length === 0 ? (
                <EmptyState title="No open work tagged to this engine" />
              ) : (
                openItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 py-2.5 text-sm">
                    {item.key && <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>}
                    <span className="flex-1 truncate">{item.title}</span>
                    <Badge
                      variant={item.status === 'blocked' ? 'destructive' : 'outline'}
                      className="shrink-0 px-1.5 py-0 font-mono text-[10px]"
                    >
                      {STATUS_META[item.status].label}
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
        </div>
      </div>
    </PageShell>
  )
}
