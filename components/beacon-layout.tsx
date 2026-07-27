'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BookOpen,
  Cable,
  CalendarDays,
  Crown,
  FileText,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Menu,
  Network,
  RefreshCw,
  Sparkles,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import { User } from '@/components/auth/user'
import { RenameWorkspaceDialog } from '@/components/workspace/rename-workspace-dialog'
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Session } from '@/lib/session/types'

type Role = 'admin' | 'manager' | 'engineer'

// roles: which access roles see the item; omitted = everyone
const navSections = [
  {
    label: 'Monitor',
    items: [
      { href: '/pulse', label: 'Pulse', icon: LayoutDashboard, roles: ['admin', 'manager', 'engineer'] as Role[] },
      { href: '/timeline', label: 'Timeline', icon: Activity },
      { href: '/work', label: 'Work', icon: ListTodo },
      { href: '/cycles', label: 'Cycles', icon: RefreshCw },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/inbox', label: 'Inbox', icon: Inbox },
      { href: '/docs', label: 'Docs', icon: FileText },
      { href: '/team', label: 'People', icon: Users },
      { href: '/org', label: 'Org', icon: Network },
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
    items: [
      { href: '/integrations', label: 'Integrations', icon: Cable, roles: ['admin'] as Role[] },
      { href: '/automation', label: 'Automation', icon: Workflow, roles: ['admin', 'manager'] as Role[] },
    ],
  },
]

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
    id: string
    name: string
    memberName: string
    teams: { id: string; name: string; isLead: boolean }[]
    memberships: { workspaceId: string; workspaceName: string }[]
  } | null
  unreadNotifications?: number
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  engineer: 'Engineer',
}

export function BeaconLayout({
  children,
  session,
  githubConnection,
  role,
  workspace,
  unreadNotifications = 0,
}: BeaconLayoutProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const homeHref = '/pulse'
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <WorkspaceSwitcher
                currentWorkspaceId={workspace.id}
                currentWorkspaceName={workspace.name}
                memberships={workspace.memberships}
              />
              {role === 'admin' && <RenameWorkspaceDialog currentName={workspace.name} />}
            </div>
            <span className="shrink-0 rounded-full bg-beacon/10 px-2 py-0.5 font-mono text-[10px] font-medium text-beacon">
              {ROLE_LABEL[role]}
            </span>
          </div>
          {workspace.teams.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {workspace.teams.map((team) => (
                <span
                  key={team.id}
                  className="inline-flex items-center gap-1 rounded-full bg-sidebar-accent/50 px-2 py-0.5 font-mono text-[10px] text-sidebar-foreground/65"
                  title={team.isLead ? `${team.name} — you lead this team` : team.name}
                >
                  {team.isLead && <Crown className="h-2.5 w-2.5 text-beacon" strokeWidth={2.5} />}
                  {team.name}
                </span>
              ))}
            </div>
          )}
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
                      'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200',
                      active
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute inset-y-1.5 left-0 w-0.5 origin-center rounded-full bg-beacon transition-all duration-300 ease-out-soft',
                        active ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
                      )}
                    />
                    <Icon className={cn('h-4 w-4 shrink-0 transition-colors duration-200', active && 'text-beacon')} />
                    <span className="flex-1">{label}</span>
                    {href === '/inbox' && unreadNotifications > 0 && (
                      <span className="rounded-full bg-beacon px-1.5 py-0.5 font-mono text-[10px] font-semibold text-beacon-foreground">
                        {unreadNotifications > 99 ? '99+' : unreadNotifications}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <User
          user={session?.user ?? null}
          authProvider={session?.authProvider ?? null}
          githubConnection={githubConnection}
        />
      </div>
    </div>
  )

  return (
    <div className="flex h-dvh bg-background">
      <aside className="hidden w-60 shrink-0 border-r lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="animate-in slide-in-from-left w-64 border-r shadow-xl duration-300 ease-out-soft">
            {sidebar}
          </div>
          <button
            className="animate-in fade-in flex-1 cursor-default bg-black/50 backdrop-blur-[2px] duration-300"
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
