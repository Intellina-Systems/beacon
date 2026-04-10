import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session/get-server-session'
import { SignIn } from '@/components/auth/sign-in'
import { Zap } from 'lucide-react'

export default async function Home() {
  const session = await getServerSession()

  if (session?.user) {
    redirect('/projects')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-4 py-16">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="flex items-center gap-3">
          <Zap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Beacon</h1>
        </div>

        <p className="text-muted-foreground text-lg">
          AI-powered PM tool that bridges where your team works and where work is tracked.
        </p>

        <ul className="text-sm text-muted-foreground text-left space-y-1 w-full">
          <li>• Sync projects and issues from Linear</li>
          <li>• Ingest signals from WhatsApp, email, docs</li>
          <li>• Surface what needs attention each morning</li>
          <li>• Recommend what to build next</li>
        </ul>

        <div className="pt-2">
          <SignIn />
        </div>
      </div>
    </div>
  )
}
