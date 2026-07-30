'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Bot, CircleCheck, GitCommit, GitMerge, GitPullRequest, Sparkles, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getEnabledAuthProviders } from '@/lib/auth/providers'

type FeedItem = {
  id: number
  icon: typeof GitMerge
  text: string
  time: string
  alert?: boolean
  lit?: boolean
}

const FEED_SEED: Omit<FeedItem, 'id'>[] = [
  { icon: GitMerge, text: 'pr.merged — auth refactor lands in main', time: '2m' },
  { icon: Bot, text: 'agent.tests_passed — 214 specs green', time: '9m' },
  { icon: AlertTriangle, text: 'task.blocked — waiting on API keys', time: '31m', alert: true },
  { icon: GitCommit, text: 'code.commit — fix flaky retry backoff', time: '1h' },
  { icon: GitPullRequest, text: 'pr.opened — event ingestion pipeline', time: '2h' },
  { icon: CircleCheck, text: 'task.completed — BCN-42 shipped', time: '4h' },
]

const FEED_POOL: Omit<FeedItem, 'id' | 'time'>[] = [
  { icon: Bot, text: 'agent.heartbeat — claude-code still on task' },
  { icon: GitCommit, text: 'code.commit — tighten retry jitter' },
  { icon: GitPullRequest, text: 'pr.review_requested — event schema v2' },
  { icon: CircleCheck, text: 'task.completed — BCN-58 shipped' },
  { icon: GitMerge, text: 'pr.merged — pulse dashboard redesign' },
  { icon: Bot, text: 'agent.tests_passed — 12 new specs green' },
]

const BARS_INITIAL = [22, 38, 30, 52, 44, 68, 58, 84, 62, 92, 76, 100, 70, 88]

const QA = [
  { q: 'Who is blocked?', a: 'Mira — waiting on staging API keys since 10:40.' },
  { q: 'What slipped this week?', a: 'BCN-77 auth redesign — pushed to Monday.' },
  { q: 'Summarize agent activity', a: '12 PRs opened, 9 merged, 3 agents running now.' },
]

const KONAMI = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
]

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

/**
 * Sign-in is deliberately understated: Beacon is invite-only, so this is a way
 * back in for people who already have an account, not a call to action for
 * strangers. Anyone else is refused at the OAuth callback.
 */
function SignInBlock({ refused }: { refused: boolean }) {
  const [redirecting, setRedirecting] = useState(false)
  const { github: hasGitHub } = getEnabledAuthProviders()
  if (!hasGitHub) return null

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          disabled={redirecting}
          onClick={() => {
            setRedirecting(true)
            window.location.href = '/api/auth/signin/github'
          }}
        >
          <GitHubIcon className="mr-2 h-4 w-4" />
          {redirecting ? 'Redirecting…' : 'Sign in with GitHub'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Invite-only — sign in with the GitHub account on your invite.
        </span>
      </div>

      {refused && (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-foreground/90"
        >
          That GitHub account isn&apos;t a member of any Beacon workspace. Ask an admin for an invite, then sign in with
          the same account.
        </p>
      )}
    </div>
  )
}

function Tile({
  className,
  style,
  children,
}: {
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <div
      style={style}
      className={cn(
        'animate-rise relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card/60 backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

function useTypewriterQA(pairs: typeof QA) {
  const [qIndex, setQIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [showAnswer, setShowAnswer] = useState(false)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setTyped(pairs[qIndex].q)
      setShowAnswer(true)
      const hold = setTimeout(() => setQIndex((i) => (i + 1) % pairs.length), 4000)
      return () => clearTimeout(hold)
    }

    const pair = pairs[qIndex]
    const timers: ReturnType<typeof setTimeout>[] = []
    setTyped('')
    setShowAnswer(false)

    for (let i = 0; i < pair.q.length; i++) {
      timers.push(setTimeout(() => setTyped(pair.q.slice(0, i + 1)), 28 * (i + 1)))
    }
    timers.push(setTimeout(() => setShowAnswer(true), 28 * pair.q.length + 350))
    timers.push(setTimeout(() => setQIndex((i) => (i + 1) % pairs.length), 28 * pair.q.length + 3400))

    return () => timers.forEach(clearTimeout)
  }, [qIndex, pairs])

  return { typed, answer: pairs[qIndex].a, showAnswer }
}

export function Landing({ signInRefused = false }: { signInRefused?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const feedIdRef = useRef(FEED_SEED.length)
  const clickTimestamps = useRef<number[]>([])

  const [bars, setBars] = useState(BARS_INITIAL)
  const [feed, setFeed] = useState<FeedItem[]>(() => FEED_SEED.map((item, i) => ({ ...item, id: i })))
  const [spinToken, setSpinToken] = useState(0)
  const [flareToken, setFlareToken] = useState(0)

  const { typed, answer, showAnswer } = useTypewriterQA(QA)

  // Console-only easter egg for anyone poking at devtools.
  useEffect(() => {
    console.log(
      '%c  ▲ BEACON  ',
      'background:#6f5cd6;color:#fff;font-family:monospace;font-weight:700;padding:4px 10px;border-radius:4px;',
    )
    console.log(
      '%cSignal received — you opened devtools. Respect.\n\nPsst: try the Konami code on this page (↑ ↑ ↓ ↓ ← → ← → B A).\nOr smash the lightning-bolt logo seven times fast.',
      'color:#8b8fa3;font-family:monospace;font-size:12px;line-height:1.6;',
    )
  }, [])

  // Mouse-follow spotlight on the blueprint grid — direct DOM write, no re-render.
  useEffect(() => {
    const el = containerRef.current
    if (!el || prefersReducedMotion()) return
    let raf = 0
    function handleMove(e: PointerEvent) {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const rect = el!.getBoundingClientRect()
        el!.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`)
        el!.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`)
      })
    }
    el.addEventListener('pointermove', handleMove)
    return () => {
      el.removeEventListener('pointermove', handleMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Live pulse — random-walk the bars so the chart feels like it's actually reporting.
  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = setInterval(() => {
      setBars((prev) => {
        const last = prev[prev.length - 1]
        const next = Math.min(100, Math.max(15, last + (Math.random() * 40 - 20)))
        return [...prev.slice(1), Math.round(next)]
      })
    }, 1400)
    return () => clearInterval(id)
  }, [])

  // Event stream — roll in a new entry every so often.
  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = setInterval(() => {
      const pick = FEED_POOL[Math.floor(Math.random() * FEED_POOL.length)]
      feedIdRef.current += 1
      setFeed((prev) => [{ ...pick, time: 'now', id: feedIdRef.current }, ...prev.slice(0, 5)])
    }, 5200)
    return () => clearInterval(id)
  }, [])

  const triggerEasterEgg = useCallback((label: string) => {
    feedIdRef.current += 1
    setFeed((prev) => [
      { icon: Sparkles, text: label, time: 'now', lit: true, id: feedIdRef.current },
      ...prev.slice(0, 5),
    ])
    setBars(Array(BARS_INITIAL.length).fill(100))
  }, [])

  // Konami code — full-screen signal flare.
  useEffect(() => {
    let buffer: string[] = []
    function handleKey(e: KeyboardEvent) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()
      buffer = [...buffer, key].slice(-KONAMI.length)
      if (buffer.join(',') === KONAMI.join(',')) {
        buffer = []
        setFlareToken((t) => t + 1)
        triggerEasterEgg('easter_egg.detected — konami sequence recognized')
        toast('🔓 Signal amplified', { description: 'Konami sequence recognized. Nice reflexes.' })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [triggerEasterEgg])

  function handleLogoClick() {
    const now = performance.now()
    clickTimestamps.current = [...clickTimestamps.current, now].filter((t) => now - t < 3000)
    if (clickTimestamps.current.length >= 7) {
      clickTimestamps.current = []
      setSpinToken((t) => t + 1)
      triggerEasterEgg('agent.curious_human — found the seventh click')
      toast('You have the persistence of a good SRE.', { description: 'Logo clicked seven times in three seconds.' })
    }
  }

  return (
    <div
      ref={containerRef}
      className="dark relative min-h-full bg-background text-foreground lg:h-full lg:overflow-hidden"
      style={{ '--mx': '35%', '--my': '30%' } as React.CSSProperties}
    >
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

      {/* Cursor-follow signal glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          background:
            'radial-gradient(560px circle at var(--mx) var(--my), color-mix(in oklch, var(--beacon) 16%, transparent), transparent 70%)',
        }}
      />

      {/* Konami easter egg — full-screen signal flare */}
      {flareToken > 0 && (
        <div
          key={flareToken}
          aria-hidden
          className="animate-signal-flare pointer-events-none absolute inset-0 z-20"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--beacon) 55%, transparent), transparent 60%)',
          }}
        />
      )}

      <div className="relative flex h-full flex-col gap-4 p-4 sm:p-6 lg:p-7">
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-6 lg:grid-rows-3 xl:gap-4">
          {/* Hero */}
          <Tile className="justify-between gap-10 p-7 sm:p-9 lg:col-span-4 lg:row-span-2">
            <div>
              <div className="mb-6 flex items-center gap-3 lg:mb-8">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleLogoClick}
                  aria-label="Beacon"
                  className="animate-beacon-pulse h-8 w-8 shrink-0 rounded-md bg-beacon p-0 hover:bg-beacon"
                >
                  <Zap
                    key={spinToken}
                    className={cn('h-4.5 w-4.5 text-beacon-foreground', spinToken > 0 && 'animate-logo-spin')}
                    strokeWidth={2.5}
                  />
                </Button>
                <span className="micro-label">Engineering intelligence layer</span>
              </div>
              <h1 className="font-mono text-4xl font-semibold leading-tight tracking-[0.12em] sm:text-5xl xl:text-6xl">
                BEACON
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground xl:text-lg">
                Don&apos;t manage tasks — understand engineering. Every commit, PR, task, agent run, and CI result in
                one stream.
              </p>
              <SignInBlock refused={signInRefused} />
            </div>
          </Tile>

          {/* Live pulse — mini chart */}
          <Tile className="p-5 lg:col-span-2" style={{ animationDelay: '80ms' }}>
            <p className="micro-label shrink-0">Live pulse</p>
            <div className="mt-4 flex h-20 items-end gap-1 lg:h-auto lg:min-h-16 lg:flex-1">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[2px] bg-foreground/80 transition-[height,opacity] duration-700 ease-out"
                  style={{ height: `${h}%`, opacity: 0.25 + (h / 100) * 0.75 }}
                />
              ))}
            </div>
            <p className="mt-3 shrink-0 text-xs leading-relaxed text-muted-foreground">
              Real-time visibility without asking for status updates.
            </p>
          </Tile>

          {/* Ask anything */}
          <Tile className="p-5 lg:col-span-2" style={{ animationDelay: '140ms' }}>
            <p className="micro-label flex shrink-0 items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Ask anything
            </p>
            <div className="mt-4 flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-hidden">
              <span className="inline-flex w-fit items-center rounded-full border bg-background/60 px-3 py-1 text-xs text-foreground/90">
                {typed}
                <span className="animate-caret-blink ml-0.5 inline-block h-3 w-px bg-foreground/60" />
              </span>
              <p
                className={cn(
                  'pl-1 text-xs leading-relaxed text-muted-foreground transition-opacity duration-300',
                  showAnswer ? 'opacity-100' : 'opacity-0',
                )}
              >
                {answer}
              </p>
            </div>
          </Tile>

          {/* Event stream — live feed */}
          <Tile className="p-5 lg:col-span-3" style={{ animationDelay: '200ms' }}>
            <p className="micro-label shrink-0">Event stream</p>
            <div className="mt-3 flex min-h-0 flex-1 flex-col justify-evenly divide-y divide-border/60 overflow-hidden">
              {feed.map(({ id, icon: Icon, text, time, alert, lit }) => (
                <div key={id} className="animate-rise flex items-center gap-2.5 py-2">
                  <Icon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      alert ? 'text-destructive' : lit ? 'text-beacon' : 'text-muted-foreground',
                    )}
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate font-mono text-xs',
                      lit ? 'text-beacon' : 'text-foreground/80',
                    )}
                  >
                    {text}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{time}</span>
                </div>
              ))}
            </div>
          </Tile>

          {/* Agent-native — API snippet */}
          <Tile className="p-5 lg:col-span-3" style={{ animationDelay: '260ms' }}>
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

        <p
          className="animate-rise shrink-0 px-1 font-mono text-[11px] tracking-wide text-muted-foreground"
          style={{ animationDelay: '320ms' }}
        >
          GitHub · CI/CD · Coding agents · Knowledge
        </p>
      </div>
    </div>
  )
}
