'use client'

import { useEffect } from 'react'

// One-shot: if the member has no stored timezone, detect the browser's IANA
// zone and persist it so calendar display + reminders use the right clock.
export function TimezoneCapture({ hasTimezone }: { hasTimezone: boolean }) {
  useEffect(() => {
    if (hasTimezone) return
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return
    void fetch('/api/calendar/timezone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone: tz }),
    })
  }, [hasTimezone])
  return null
}
