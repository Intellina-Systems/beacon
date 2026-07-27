'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BookOpen,
  Cable,
  CalendarDays,
  FileText,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Network,
  PanelLeftIcon,
  RefreshCw,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from 'lucide-react'
import { User } from '@/components/auth/user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
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

// Doubles as the sidebar toggle: hovering the mark swaps the beacon icon for a
// collapse/expand affordance, so opening/closing the sidebar has no separate button.
function BeaconTrigger({ compact = false }: { compact?: boolean }) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="Toggle sidebar"
      title="Toggle sidebar"
      className="group/logo flex items-center gap-2.5 rounded-md"
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-beacon">
        <Zap
          className="h-4 w-4 text-beacon-foreground transition-opacity duration-150 group-hover/logo:opacity-0"
          strokeWidth={2.5}
        />
        <PanelLeftIcon className="absolute h-4 w-4 text-beacon-foreground opacity-0 transition-opacity duration-150 group-hover/logo:opacity-100" />
      </span>
      <span
        className={cn(
          'font-mono font-semibold tracking-[0.18em] text-sidebar-foreground group-data-[collapsible=icon]:hidden',
          compact ? 'text-xs' : 'text-sm',
        )}
      >
        BEACON
      </span>
    </button>
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
  defaultSidebarOpen?: boolean
}

export function BeaconLayout({
  children,
  session,
  githubConnection,
  role,
  workspace,
  unreadNotifications = 0,
  defaultSidebarOpen = true,
}: BeaconLayoutProps) {
  const pathname = usePathname()

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !('roles' in item) || item.roles?.includes(role)),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <SidebarProvider defaultOpen={defaultSidebarOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-14 shrink-0 flex-row items-center border-b border-sidebar-border px-4 py-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-[10px]">
          <BeaconTrigger />
        </SidebarHeader>

        <SidebarContent className="px-2 py-3">
          {visibleSections.map((section) => (
            <SidebarGroup key={section.label} className="p-0 py-2">
              <SidebarGroupLabel className="micro-label px-3 text-sidebar-foreground/70">
                {section.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map(({ href, label, icon: Icon }) => {
                    const active = pathname.startsWith(href)
                    return (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton asChild isActive={active} tooltip={label}>
                          <Link href={href} aria-current={active ? 'page' : undefined}>
                            <Icon className={cn(active && 'text-beacon')} />
                            <span className="flex-1">{label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {href === '/inbox' && unreadNotifications > 0 && (
                          <SidebarMenuBadge className="rounded-full bg-beacon px-1.5 py-0.5 font-mono text-[10px] font-semibold text-beacon-foreground">
                            {unreadNotifications > 99 ? '99+' : unreadNotifications}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="shrink-0 border-t border-sidebar-border p-2">
          <User
            user={session?.user ?? null}
            authProvider={session?.authProvider ?? null}
            githubConnection={githubConnection}
            role={role}
            workspace={workspace}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="overflow-hidden">
        <div className="flex h-12 shrink-0 items-center px-4 lg:hidden">
          <BeaconTrigger compact />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
