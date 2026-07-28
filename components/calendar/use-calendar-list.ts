import { useState } from 'react'
import { toast } from 'sonner'
import type { CalendarSummary, RosterMember } from './types'

export function useCalendarList({
  initialCalendars,
  roster,
  defaultTimezone,
  onCalendarsMutated,
}: {
  initialCalendars: CalendarSummary[]
  roster: RosterMember[]
  defaultTimezone: string
  onCalendarsMutated: () => void
}) {
  const [calendars, setCalendars] = useState(initialCalendars)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  function toggleHidden(id: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const [createCalendarOpen, setCreateCalendarOpen] = useState(false)
  const [newCalendarName, setNewCalendarName] = useState('')
  const [creatingCalendar, setCreatingCalendar] = useState(false)

  async function submitCreateCalendar() {
    const name = newCalendarName.trim()
    if (!name) return
    setCreatingCalendar(true)
    try {
      const res = await fetch('/api/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, timezone: defaultTimezone }),
      })
      if (res.ok) {
        const list = await (await fetch('/api/calendars')).json()
        setCalendars(list.calendars)
        toast.success('Calendar created')
        setCreateCalendarOpen(false)
        setNewCalendarName('')
      } else {
        toast.error('Could not create calendar')
      }
    } finally {
      setCreatingCalendar(false)
    }
  }

  const [shareTargetId, setShareTargetId] = useState<string | null>(null)
  const [shareEmail, setShareEmail] = useState('')
  const [sharing, setSharing] = useState(false)

  async function submitShare() {
    const email = shareEmail.trim()
    if (!email || !shareTargetId) return
    setSharing(true)
    try {
      const member = roster.find((m) => m.email?.toLowerCase() === email.toLowerCase())
      const res = await fetch(`/api/calendars/${shareTargetId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(member ? { memberId: member.id, role: 'reader' } : { email, role: 'reader' }),
      })
      if (res.ok) {
        toast.success('Calendar shared')
        setShareTargetId(null)
        setShareEmail('')
      } else {
        toast.error('Could not share')
      }
    } finally {
      setSharing(false)
    }
  }

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  async function confirmDeleteCalendar() {
    if (!deleteTargetId) return
    const id = deleteTargetId
    const res = await fetch(`/api/calendars/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setCalendars(calendars.filter((c) => c.id !== id))
      onCalendarsMutated()
      toast.success('Calendar deleted')
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? 'Could not delete')
    }
    setDeleteTargetId(null)
  }

  async function importIcs(file: File, calendarId: string) {
    const ics = await file.text()
    const res = await fetch(`/api/calendars/${calendarId}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ics }),
    })
    if (res.ok) {
      const data = (await res.json()) as { imported: number }
      toast.success(`Imported ${data.imported} events`)
      onCalendarsMutated()
    } else {
      toast.error('Import failed')
    }
  }

  return {
    calendars,
    hidden,
    toggleHidden,
    createCalendarOpen,
    setCreateCalendarOpen,
    newCalendarName,
    setNewCalendarName,
    creatingCalendar,
    submitCreateCalendar,
    shareTargetId,
    setShareTargetId,
    shareEmail,
    setShareEmail,
    sharing,
    submitShare,
    deleteTargetId,
    setDeleteTargetId,
    confirmDeleteCalendar,
    importIcs,
  }
}
