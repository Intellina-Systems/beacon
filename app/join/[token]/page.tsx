import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { Zap } from 'lucide-react'
import { db } from '@/lib/db/client'
import { members, workspaces } from '@/lib/db/schema'
import { findClaimableInvite } from '@/lib/invites'
import { getServerSession } from '@/lib/session/get-server-session'
import { AcceptInviteButton } from '@/components/invites/accept-invite-button'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Join workspace' }

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6 text-center shadow-sm">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-beacon">
          <Zap className="h-5 w-5 text-beacon-foreground" strokeWidth={2.5} />
        </span>
        {children}
      </div>
    </div>
  )
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await findClaimableInvite(token)

  if (!invite) {
    return (
      <JoinShell>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Invite not valid</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This invite link is invalid, expired, or already used. Ask a workspace admin for a new one.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Go to Beacon</Link>
        </Button>
      </JoinShell>
    )
  }

  const [[workspace], [invitedMember], [inviter]] = await Promise.all([
    db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, invite.workspaceId)).limit(1),
    db
      .select({ name: members.name, accessRole: members.accessRole })
      .from(members)
      .where(eq(members.id, invite.memberId))
      .limit(1),
    invite.invitedByMemberId
      ? db.select({ name: members.name }).from(members).where(eq(members.id, invite.invitedByMemberId)).limit(1)
      : Promise.resolve([null]),
  ])

  const session = await getServerSession()
  if (session?.user) {
    const [alreadyMember] = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.workspaceId, invite.workspaceId), eq(members.authUserId, session.user.id)))
      .limit(1)
    if (alreadyMember) redirect('/')
  }

  return (
    <JoinShell>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Join {workspace?.name ?? 'this workspace'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {inviter?.name ? `${inviter.name} invited` : 'You have been invited as'}{' '}
          <span className="font-medium text-foreground">{invitedMember?.name}</span> to join as{' '}
          <span className="font-medium text-foreground">{invitedMember?.accessRole}</span> on Beacon.
        </p>
      </div>
      {session?.user ? (
        <AcceptInviteButton token={token} />
      ) : (
        <Button asChild className="w-full">
          <a href={`/api/invites/start?token=${encodeURIComponent(token)}`}>Sign in with GitHub to join</a>
        </Button>
      )}
    </JoinShell>
  )
}
