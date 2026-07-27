'use client'

import type { Session } from '@/lib/session/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { redirectToSignOut } from '@/lib/session/redirect-to-sign-out'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/theme-toggle'
import { getEnabledAuthProviders } from '@/lib/auth/providers'
import { ChevronsUpDown } from 'lucide-react'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

interface SignOutProps {
  user: Session['user']
  authProvider: Session['authProvider']
  githubConnection: { connected: boolean; username: string | null }
}

export function SignOut({ user, authProvider, githubConnection }: SignOutProps) {
  const router = useRouter()
  const { github: hasGitHub } = getEnabledAuthProviders()

  const handleSignOut = async () => {
    await redirectToSignOut()
    toast.success('You have been logged out.')
  }

  const handleGitHubDisconnect = async () => {
    try {
      const response = await fetch('/api/auth/github/disconnect', { method: 'POST' })
      if (response.ok) {
        toast.success('GitHub disconnected')
        router.refresh()
      } else {
        toast.error('Failed to disconnect GitHub')
      }
    } catch {
      toast.error('Failed to disconnect GitHub')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/60 focus:outline-none focus:ring-2 focus:ring-sidebar-ring"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={user?.avatar ? `${user.avatar}&s=72` : undefined} alt={user.username} />
            <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-sidebar-foreground">
              {user.name ?? user.username}
            </span>
            <span className="block truncate text-xs text-sidebar-foreground/55">
              {user.email ?? `@${user.username}`}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <ThemeToggle />

        {authProvider === 'vercel' && hasGitHub && (
          <>
            {githubConnection.connected ? (
              <DropdownMenuItem onClick={handleGitHubDisconnect} className="cursor-pointer">
                <GitHubIcon className="h-4 w-4 mr-2" />
                Disconnect GitHub
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => (window.location.href = '/api/auth/github/signin')}
                className="cursor-pointer"
              >
                <GitHubIcon className="h-4 w-4 mr-2" />
                Connect GitHub
              </DropdownMenuItem>
            )}
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
          {authProvider === 'github' ? (
            <>
              <GitHubIcon className="h-4 w-4 mr-2" />
              Sign out
            </>
          ) : (
            <>
              <svg viewBox="0 0 76 65" className="h-3 w-3 mr-2" fill="currentColor">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
              Sign out
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
