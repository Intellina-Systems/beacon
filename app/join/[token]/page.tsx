import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { Zap } from 'lucide-react'
import { db } from '@/lib/db/client'
import { members, workspaces } from '@/lib/db/schema'
import { findInviteByToken } from '@/lib/invites'
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
  // Accepts already-claimed links too: after the first use this becomes the
  // member's standing way back in, which is the only sign-in entry point now
  // that the landing page has none.
  const invite = await findInviteByToken(token)

  const expiredBeforeFirstUse = invite && !invite.acceptedAt && invite.expiresAt.getTime() < Date.now()

  if (!invite || expiredBeforeFirstUse) {
    return (
      <JoinShell>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Link not valid</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {expiredBeforeFirstUse
              ? 'This invite expired before it was used. Ask a workspace admin for a new one.'
              : 'This link is invalid or has been revoked. Ask a workspace admin for a new one.'}
          </p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Go to Beacon</Link>
        </Button>
      </JoinShell>
    )
  }

  const returning = Boolean(invite.acceptedAt)

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
    // Already signed in and already a member — nothing to accept, just go in.
    if (alreadyMember) redirect('/')
  }

  return (
    <JoinShell>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          {returning ? `Sign in to ${workspace?.name ?? 'Beacon'}` : `Join ${workspace?.name ?? 'this workspace'}`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {returning ? (
            <>
              Continue as <span className="font-medium text-foreground">{invitedMember?.name}</span> (
              {invitedMember?.accessRole}). You&apos;ll be asked to sign in with the GitHub account already linked to
              this member.
            </>
          ) : (
            <>
              {inviter?.name ? `${inviter.name} invited` : 'You have been invited as'}{' '}
              <span className="font-medium text-foreground">{invitedMember?.name}</span> to join as{' '}
              <span className="font-medium text-foreground">{invitedMember?.accessRole}</span> on Beacon.
            </>
          )}
        </p>
      </div>
      {session?.user ? (
        <AcceptInviteButton token={token} />
      ) : (
        <Button asChild className="w-full">
          <a href={`/api/invites/start?token=${encodeURIComponent(token)}`}>
            {returning ? 'Sign in with GitHub' : 'Sign in with GitHub to join'}
          </a>
        </Button>
      )}
    </JoinShell>
  )
}
