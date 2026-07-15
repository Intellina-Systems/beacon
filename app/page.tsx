import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session/get-server-session'
import { SignIn } from '@/components/auth/sign-in'
import { Zap, Activity, Bot, Sparkles, LayoutDashboard } from 'lucide-react'

const features = [
  {
    icon: Activity,
    title: 'Event stream',
    description: 'Every commit, PR, task, and agent run lands in one timeline.',
  },
  {
    icon: Bot,
    title: 'Agent-native',
    description: 'Coding agents and CI push structured events via API.',
  },
  {
    icon: LayoutDashboard,
    title: 'Live pulse',
    description: 'Real-time visibility without asking for status updates.',
  },
  {
    icon: Sparkles,
    title: 'Ask anything',
    description: '“Who is blocked?” “What slipped this week?” — it already knows.',
  },
]

export default async function Home() {
  const session = await getServerSession()

  if (session?.user) {
    redirect('/pulse')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-20">
      <div className="flex flex-col items-center gap-10 max-w-lg w-full">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-foreground flex items-center justify-center shadow-lg">
            <Zap className="h-7 w-7 text-background" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-4xl font-bold tracking-tight">Beacon</h1>
            <p className="text-muted-foreground text-base text-center leading-relaxed max-w-xs">
              The engineering intelligence layer. Don&apos;t manage tasks — understand engineering.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-xl border bg-card p-4 flex flex-col gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium leading-none">{title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>

        <SignIn />
      </div>
    </div>
  )
}
