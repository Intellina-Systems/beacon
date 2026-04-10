import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session/get-server-session'
import { SignIn } from '@/components/auth/sign-in'
import { Zap, GitBranch, MessageSquare, Bell, Sparkles } from 'lucide-react'

const features = [
  {
    icon: GitBranch,
    title: 'Sync from Linear',
    description: 'Projects and issues pulled in automatically.',
  },
  {
    icon: MessageSquare,
    title: 'Ingest signals',
    description: 'WhatsApp, email, and docs all in one place.',
  },
  {
    icon: Bell,
    title: 'Morning briefing',
    description: 'Surface what actually needs your attention.',
  },
  {
    icon: Sparkles,
    title: 'Next-step recommendations',
    description: 'AI-suggested priorities based on your context.',
  },
]

export default async function Home() {
  const session = await getServerSession()

  if (session?.user) {
    redirect('/chat')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-20">
      <div className="flex flex-col items-center gap-10 max-w-lg w-full">

        {/* Logo mark */}
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-foreground flex items-center justify-center shadow-lg">
            <Zap className="h-7 w-7 text-background" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-4xl font-bold tracking-tight">Beacon</h1>
            <p className="text-muted-foreground text-base text-center leading-relaxed max-w-xs">
              The PM tool that bridges where your team works and where work is tracked.
            </p>
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 gap-3 w-full">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border bg-card p-4 flex flex-col gap-2"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium leading-none">{title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <SignIn />
      </div>
    </div>
  )
}
