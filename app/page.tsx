import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/session/get-server-session'
import { SignIn } from '@/components/auth/sign-in'
import {
  AlertTriangle,
  Bot,
  CircleCheck,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Sparkles,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const FEED = [
  { icon: GitMerge, text: 'pr.merged — auth refactor lands in main', time: '2m' },
  { icon: Bot, text: 'agent.tests_passed — 214 specs green', time: '9m' },
  { icon: AlertTriangle, text: 'task.blocked — waiting on API keys', time: '31m', alert: true },
  { icon: GitCommit, text: 'code.commit — fix flaky retry backoff', time: '1h' },
  { icon: GitPullRequest, text: 'pr.opened — event ingestion pipeline', time: '2h' },
  { icon: CircleCheck, text: 'task.completed — BCN-42 shipped', time: '4h' },
]

const BARS = [22, 38, 30, 52, 44, 68, 58, 84, 62, 92, 76, 100, 70, 88]

const QA = [
  { q: 'Who is blocked?', a: 'Mira — waiting on staging API keys since 10:40.' },
  { q: 'What slipped this week?' },
  { q: 'Summarize agent activity' },
]

function Tile({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card/60 backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

export default async function Home() {
  const session = await getServerSession()

  if (session?.user) {
    redirect('/pulse')
  }

  return (
    <div className="dark relative min-h-full bg-background text-foreground lg:h-full lg:overflow-hidden">
      {/* Blueprint grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(to right, oklch(1 0 0 / 4%) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 4%) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 35% 30%, black, transparent)',
        }}
      />

      <div className="relative flex h-full flex-col gap-4 p-4 sm:p-6 lg:p-7">
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-6 lg:grid-rows-3 xl:gap-4">
          {/* Hero */}
          <Tile className="justify-between gap-10 p-7 sm:p-9 lg:col-span-4 lg:row-span-2">
            <div>
              <div className="mb-6 flex items-center gap-3 lg:mb-8">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-beacon">
                  <Zap className="h-4.5 w-4.5 text-beacon-foreground" strokeWidth={2.5} />
                </span>
                <span className="micro-label">Engineering intelligence layer</span>
              </div>
              <h1 className="font-mono text-4xl font-semibold leading-tight tracking-[0.12em] sm:text-5xl xl:text-6xl">
                BEACON
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground xl:text-lg">
                Don&apos;t manage tasks — understand engineering. Every commit, PR, task, agent run, and CI result in
                one stream.
              </p>
            </div>
            <SignIn />
          </Tile>

          {/* Live pulse — mini chart */}
          <Tile className="p-5 lg:col-span-2">
            <p className="micro-label shrink-0">Live pulse</p>
            <div className="mt-4 flex h-20 items-end gap-1 lg:h-auto lg:min-h-16 lg:flex-1">
              {BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[2px] bg-foreground/80"
                  style={{ height: `${h}%`, opacity: 0.25 + (h / 100) * 0.75 }}
                />
              ))}
            </div>
            <p className="mt-3 shrink-0 text-xs leading-relaxed text-muted-foreground">
              Real-time visibility without asking for status updates.
            </p>
          </Tile>

          {/* Ask anything */}
          <Tile className="p-5 lg:col-span-2">
            <p className="micro-label flex shrink-0 items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Ask anything
            </p>
            <div className="mt-4 flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-hidden">
              {QA.map(({ q, a }) => (
                <div key={q}>
                  <span className="inline-block rounded-full border bg-background/60 px-3 py-1 text-xs text-foreground/90">
                    {q}
                  </span>
                  {a && <p className="mt-1.5 pl-1 text-xs leading-relaxed text-muted-foreground">{a}</p>}
                </div>
              ))}
            </div>
          </Tile>

          {/* Event stream — fake feed */}
          <Tile className="p-5 lg:col-span-3">
            <p className="micro-label shrink-0">Event stream</p>
            <div className="mt-3 flex min-h-0 flex-1 flex-col justify-evenly divide-y divide-border/60 overflow-hidden">
              {FEED.map(({ icon: Icon, text, time, alert }) => (
                <div key={text} className="flex items-center gap-2.5 py-2">
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', alert ? 'text-destructive' : 'text-muted-foreground')} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">{text}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{time}</span>
                </div>
              ))}
            </div>
          </Tile>

          {/* Agent-native — API snippet */}
          <Tile className="p-5 lg:col-span-3">
            <p className="micro-label flex shrink-0 items-center gap-1.5">
              <Bot className="h-3 w-3" />
              Agent-native
            </p>
            <pre className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border bg-background/70 p-4 font-mono text-xs leading-relaxed text-foreground/80">
              {`POST /api/events
Authorization: Bearer bcn_****

{
  "type": "agent.tests_passed",
  "summary": "CI green on beacon#482",
  "actor": "claude-code"
}`}
            </pre>
            <p className="mt-3 hidden shrink-0 text-xs leading-relaxed text-muted-foreground xl:block">
              Coding agents and CI push structured events — Beacon attributes them to people and work.
            </p>
          </Tile>
        </div>

        <p className="shrink-0 px-1 font-mono text-[11px] tracking-wide text-muted-foreground">
          GitHub · Linear · CI/CD · Coding agents · Knowledge
        </p>
      </div>
    </div>
  )
}
