import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session/get-server-session'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { Landing } from '@/components/marketing/landing'
import { NoAccess } from '@/components/marketing/no-access'

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getServerSession()
  const { error } = await searchParams

  if (session?.user) {
    const ctx = await getWorkspaceContext()
    // Signed in but in no workspace. Sign-in is gated, so this is close to
    // unreachable — but bouncing to an app page would loop, since every one of
    // them sends a context-less visitor straight back here.
    if (!ctx) return <NoAccess username={session.user.username} />
    redirect('/pulse')
  }

  return <Landing signInRefused={error === 'not_invited'} />
}
