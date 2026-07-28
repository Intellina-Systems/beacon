'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Panel, PanelHeader } from '@/components/page-shell'
import { RelativeTime } from '@/components/ui/relative-time'

interface GoogleCalendarCardProps {
  configured: boolean
  connected: boolean
  email: string | null
  lastSyncedAt: Date | string | null
}

export function GoogleCalendarCard({ configured, connected, email, lastSyncedAt }: GoogleCalendarCardProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function syncNow() {
    setBusy(true)
    try {
      const res = await fetch('/api/calendar/sync', { method: 'POST' })
      const data = (await res.json().catch(() => null)) as { events?: number; error?: string } | null
      if (res.ok) {
        toast.success(`Calendar synced${typeof data?.events === 'number' ? ` · ${data.events} new` : ''}`)
        router.refresh()
      } else {
        toast.error(data?.error ?? 'Sync failed')
      }
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      const res = await fetch('/api/auth/google/disconnect', { method: 'POST' })
      if (res.ok) {
        toast.success('Calendar disconnected')
        router.refresh()
      } else {
        toast.error('Could not disconnect')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <PanelHeader
        label={
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Google Calendar
          </span>
        }
        meta={connected ? <span className="text-beacon">Connected</span> : undefined}
      />
      <div className="px-4 py-3.5">
        {!configured ? (
          <p className="text-sm text-muted-foreground">
            Calendar integration isn&apos;t set up on this Beacon instance yet. An admin needs to add the Google OAuth
            credentials.
          </p>
        ) : connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="truncate">{email ?? 'Google account'}</p>
              <p className="text-xs text-muted-foreground">
                {lastSyncedAt ? <RelativeTime date={lastSyncedAt} prefix="Last synced " /> : 'Not synced yet'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={syncNow} disabled={busy}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Sync now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={disconnect}
                disabled={busy}
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Connect your calendar so meetings show up on Beacon and your daily plan reflects your real schedule.
            </p>
            <Button size="sm" asChild disabled={busy}>
              <a href="/api/auth/google/signin">Connect</a>
            </Button>
          </div>
        )}
      </div>
    </Panel>
  )
}
