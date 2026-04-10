'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FolderKanban, Users, Zap, Menu, X, Sun, Moon } from 'lucide-react'
import { User } from '@/components/auth/user'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'

const navItems = [
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/team', label: 'Team', icon: Users },
]

function ThemeCycleButton() {
  const { resolvedTheme, setTheme } = useTheme()

  const cycle = () => {
    if (resolvedTheme === 'light') setTheme('dark')
    else setTheme('light')
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0"
      onClick={cycle}
      title="Toggle theme"
      suppressHydrationWarning
    >
      <span suppressHydrationWarning>
        {resolvedTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </span>
    </Button>
  )
}

export function BeaconLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const sidebar = (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Logo */}
      <div className="px-4 py-4 border-b flex items-center justify-between">
        <Link href="/projects" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Zap className="h-5 w-5 text-primary" />
          <span className="font-semibold text-lg tracking-tight">Beacon</span>
        </Link>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 lg:hidden" onClick={() => setMobileOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <User />
        </div>
        <ThemeCycleButton />
      </div>
    </div>
  )

  return (
    <div className="flex h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-56 border-r flex-shrink-0">{sidebar}</aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-56 border-r shadow-xl">{sidebar}</div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setMobileOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <Link href="/projects" className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="font-semibold">Beacon</span>
          </Link>
        </div>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
