'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BookOpen,
  Cable,
  Crown,
  LayoutDashboard,
  ListTodo,
  Menu,
  Moon,
  Sparkles,
  Sun,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { User } from '@/components/auth/user'
import { RenameWorkspaceDialog } from '@/components/workspace/rename-workspace-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import type { Session } from '@/lib/session/types'

type Role = 'admin' | 'manager' | 'engineer'

// roles: which access roles see the item; omitted = everyone
const navSections = [
  {
    label: 'Monitor',
    items: [
      { href: '/pulse', label: 'Pulse', icon: LayoutDashboard, roles: ['admin', 'manager'] as Role[] },
      { href: '/timeline', label: 'Timeline', icon: Activity },
      { href: '/work', label: 'Work', icon: ListTodo },
      { href: '/team', label: 'Team', icon: Users },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/chat', label: 'Ask Beacon', icon: Sparkles },
      { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
    ],
  },
  {
    label: 'Configure',
    items: [{ href: '/integrations', label: 'Integrations', icon: Cable, roles: ['admin'] as Role[] }],
  },
]

function ThemeCycleButton() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-sidebar-foreground/70 hover:text-sidebar-foreground"
      onClick={() => mounted && setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
      title="Toggle theme"
      disabled={!mounted}
      aria-label="Toggle theme"
    >
      {mounted ? resolvedTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" /> : null}
    </Button>
  )
}

function BeaconMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-beacon">
        <Zap className="h-4 w-4 text-beacon-foreground" strokeWidth={2.5} />
      </span>
      <span
        className={cn(
          'font-mono font-semibold tracking-[0.18em] text-sidebar-foreground',
          compact ? 'text-xs' : 'text-sm',
        )}
      >
        BEACON
      </span>
    </span>
  )
}

interface BeaconLayoutProps {
  children: React.ReactNode
  session: Session | null | undefined
  githubConnection: { connected: boolean; username: string | null }
  role: Role
  workspace: {
    name: string
    memberName: string
    teams: { id: string; name: string; isLead: boolean }[]
  } | null
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  engineer: 'Engineer',
}

export function BeaconLayout({ children, session, githubConnection, role, workspace }: BeaconLayoutProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const homeHref = role === 'admin' || role === 'manager' ? '/pulse' : '/timeline'
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !('roles' in item) || item.roles?.includes(role)),
    }))
    .filter((section) => section.items.length > 0)

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
        <Link href={homeHref} className="transition-opacity hover:opacity-80" onClick={() => setMobileOpen(false)}>
          <BeaconMark />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {workspace && (
        <div className="shrink-0 border-b border-sidebar-border px-4 py-3">
          <p className="micro-label mb-1">Workspace</p>
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 truncate text-sm font-semibold text-sidebar-foreground" title={workspace.name}>
              {workspace.name}
            </p>
            {role === 'admin' && <RenameWorkspaceDialog currentName={workspace.name} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="rounded border border-beacon/40 bg-beacon/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-beacon">
              {ROLE_LABEL[role]}
            </span>
            {workspace.teams.map((team) => (
              <span
                key={team.id}
                className="inline-flex items-center gap-1 rounded border border-sidebar-border bg-sidebar-accent/40 px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/70"
                title={team.isLead ? `${team.name} — you lead this team` : team.name}
              >
                {team.isLead && <Crown className="h-2.5 w-2.5 text-beacon" strokeWidth={2.5} />}
                {team.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <p className="micro-label mb-1.5 px-3">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                    )}
                  >
                    {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-beacon" />}
                    <Icon className={cn('h-4 w-4 shrink-0', active && 'text-beacon')} />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-sidebar-border px-3 py-3">
        <div className="min-w-0 flex-1">
          <User
            user={session?.user ?? null}
            authProvider={session?.authProvider ?? null}
            githubConnection={githubConnection}
          />
        </div>
        <ThemeCycleButton />
      </div>
    </div>
  )

  return (
    <div className="flex h-dvh bg-background">
      <aside className="hidden w-60 shrink-0 border-r lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="w-64 border-r shadow-xl">{sidebar}</div>
          <button
            className="flex-1 cursor-default bg-black/50 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Link href={homeHref}>
            <BeaconMark compact />
          </Link>
        </div>

        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
