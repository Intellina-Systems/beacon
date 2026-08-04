import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Serif } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { AccentThemeProvider } from '@/components/accent-theme-provider'
import { BeaconLayout } from '@/components/beacon-layout'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getServerSession } from '@/lib/session/get-server-session'
import { getServerGitHubConnection } from '@/lib/github/get-connection-status'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { db } from '@/lib/db/client'
import { notifications } from '@/lib/db/schema'
import { and, count, eq, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

// Docs get their own reading-optimized register — same type family as the
// rest of the product (Plex Sans for UI, Plex Mono for code), extended
// rather than reaching for an unrelated third typeface.
const plexSerif = IBM_Plex_Serif({
  variable: '--font-plex-serif',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: {
    default: 'Beacon',
    template: '%s · Beacon',
  },
  description: 'The engineering intelligence layer — every signal from code, work, agents, and CI in one stream.',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getServerSession()
  const sidebarState = (await cookies()).get('sidebar_state')?.value
  const defaultSidebarOpen = sidebarState !== 'false'
  const githubConnection = session?.user
    ? await getServerGitHubConnection(session.user.id)
    : { connected: false, username: null }
  const ctx = session?.user ? await getWorkspaceContext() : null
  const unreadNotifications = ctx
    ? ((
        await db
          .select({ value: count() })
          .from(notifications)
          .where(
            and(
              eq(notifications.workspaceId, ctx.workspaceId),
              eq(notifications.memberId, ctx.member.id),
              isNull(notifications.readAt),
            ),
          )
      )[0]?.value ?? 0)
    : 0

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plexSans.variable} ${plexMono.variable} ${plexSerif.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AccentThemeProvider>
            {session?.user ? (
              <BeaconLayout
                session={session}
                githubConnection={githubConnection}
                role={ctx?.role ?? 'engineer'}
                workspace={
                  ctx
                    ? {
                        id: ctx.workspaceId,
                        name: ctx.workspaceName,
                        memberName: ctx.member.name,
                        teams: ctx.teams,
                        memberships: ctx.memberships,
                      }
                    : null
                }
                unreadNotifications={unreadNotifications}
                defaultSidebarOpen={defaultSidebarOpen}
              >
                {children}
              </BeaconLayout>
            ) : (
              <main className="h-dvh overflow-y-auto">{children}</main>
            )}
            <Toaster />
          </AccentThemeProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
