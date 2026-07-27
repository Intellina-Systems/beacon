import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session/get-server-session'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { Landing } from '@/components/marketing/landing'

export default async function Home() {
  const session = await getServerSession()

  if (session?.user) {
    const ctx = await getWorkspaceContext()
    redirect(ctx ? '/pulse' : '/timeline')
  }

  return <Landing />
}
