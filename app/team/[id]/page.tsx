import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { AlertTriangle, ArrowLeft, ExternalLink } from 'lucide-react'
import { db } from '@/lib/db/client'
import { connections, members, workItems } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { getLinearUsers } from '@/lib/linear/client'
import { getServerSession } from '@/lib/session/get-server-session'
import { getActiveBlockers, getMemberActivity, listEvents } from '@/lib/events/queries'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EventItem } from '@/components/events/event-item'
import { EditMemberDialog } from '@/components/members/edit-member-dialog'
import { MemberConnections } from '@/components/members/member-connections'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  blocked: 'Blocked',
}

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session?.user) redirect('/')
  const userId = session.user.id

  const { id } = await params
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, id), eq(members.userId, userId)))
    .limit(1)
  if (!member) notFound()

  const [recentEvents, assignedItems, allBlockers, activityByMember] = await Promise.all([
    listEvents(userId, { memberId: member.id, sinceDays: 30, limit: 40 }),
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
          eq(workItems.userId, userId),
          eq(workItems.assigneeMemberId, member.id),
          inArray(workItems.status, ['backlog', 'todo', 'in_progress', 'in_review', 'blocked']),
        ),
      )
      .orderBy(desc(workItems.updatedAt))
      .limit(30),
    getActiveBlockers(userId),
    getMemberActivity(userId, 7),
  ])

  const linearConnectionRows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.provider, 'linear')))
    .limit(1)
  const availableLinearUsers = linearConnectionRows[0]
    ? await getLinearUsers(decrypt(linearConnectionRows[0].accessToken)).catch(() => [])
    : []

  const memberBlockers = allBlockers.filter((blocker) => blocker.member?.id === member.id)
  const weekActivity = activityByMember.get(member.id)

  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/team">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Team
          </Link>
        </Button>
      </div>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{member.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[member.role, member.email].filter(Boolean).join(' · ') || 'No details yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {weekActivity ? `${weekActivity.total} events this week` : 'No activity this week'}
            </p>
          </div>
        </div>
        <EditMemberDialog memberId={member.id} name={member.name} email={member.email} role={member.role} />
      </div>

      {memberBlockers.length > 0 && (
        <Card className="mb-6 border-red-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Currently blocked
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {memberBlockers.map((blocker) => (
              <p key={blocker.event.id} className="text-sm">
                {blocker.event.summary}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Assigned work</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {assignedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No active assigned work.</p>
            ) : (
              assignedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 py-2 text-sm">
                  {item.key && <span className="font-mono text-xs text-muted-foreground shrink-0">{item.key}</span>}
                  <span className="truncate flex-1">{item.title}</span>
                  <Badge
                    variant={item.status === 'blocked' ? 'destructive' : 'outline'}
                    className="px-1.5 py-0 text-[10px]"
                  >
                    {STATUS_LABEL[item.status] ?? item.status}
                  </Badge>
                  {item.externalUrl && (
                    <a href={item.externalUrl} target="_blank" rel="noreferrer" className="text-muted-foreground">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No events attributed yet. Link identities below so signals resolve to {member.name}.
              </p>
            ) : (
              recentEvents.slice(0, 15).map((event) => <EventItem key={event.id} event={event} />)
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <MemberConnections
          memberId={member.id}
          githubUsername={member.githubUsername}
          linearUserId={member.linearUserId}
          linearUserName={availableLinearUsers.find((u) => u.id === member.linearUserId)?.name ?? null}
          availableLinearUsers={availableLinearUsers}
        />
      </div>
    </div>
  )
}
