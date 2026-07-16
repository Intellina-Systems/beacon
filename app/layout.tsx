import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { BeaconLayout } from '@/components/beacon-layout'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getServerSession } from '@/lib/session/get-server-session'
import { getServerGitHubConnection } from '@/lib/github/get-connection-status'

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
  const githubConnection = session?.user
    ? await getServerGitHubConnection(session.user.id)
    : { connected: false, username: null }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {session?.user ? (
            <BeaconLayout session={session} githubConnection={githubConnection}>
              {children}
            </BeaconLayout>
          ) : (
            <main className="h-dvh overflow-y-auto">{children}</main>
          )}
          <Toaster />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
