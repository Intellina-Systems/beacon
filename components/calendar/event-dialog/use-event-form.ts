import { useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { toast } from 'sonner'
import { fromLocalInput, toLocalInput } from '@/lib/calendar/local-time'
import type { AttendeeValue, CalendarSummary, EditScope, ReminderValue, RosterMember } from '../types'
import type { EventDialogInitial } from './types'

export function useEventForm({
  open,
  mode,
  initial,
  calendars,
  roster,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  mode: 'create' | 'edit'
  initial: EventDialogInitial
  calendars: CalendarSummary[]
  roster: RosterMember[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const writableCalendars = calendars.filter((c) => !c.readOnly)
  const defaultTz = initial.timezone ?? writableCalendars[0]?.timezone ?? DateTime.local().zoneName ?? 'UTC'

  const [title, setTitle] = useState(initial.title ?? '')
  const [calendarId, setCalendarId] = useState(initial.calendarId ?? writableCalendars[0]?.id ?? '')
  const [allDay, setAllDay] = useState(initial.allDay ?? false)
  const [timezone] = useState(defaultTz)
  const [startLocal, setStartLocal] = useState(toLocalInput(initial.startISO, defaultTz, initial.allDay ?? false))
  const [endLocal, setEndLocal] = useState(toLocalInput(initial.endISO, defaultTz, initial.allDay ?? false))
  const [rrule, setRrule] = useState<string | null>(initial.rrule ?? null)
  const [location, setLocation] = useState(initial.location ?? '')
  const [conferenceUrl, setConferenceUrl] = useState(initial.conferenceUrl ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [guests, setGuests] = useState<AttendeeValue[]>(initial.attendees ?? [])
  const [reminders, setReminders] = useState<ReminderValue[]>(
    initial.reminders ?? [{ method: 'popup', minutesBefore: 10 }],
  )
  const [guestInput, setGuestInput] = useState('')
  const [guestPickerOpen, setGuestPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [scopePrompt, setScopePrompt] = useState<null | 'edit' | 'delete'>(null)

  useEffect(() => {
    if (!open) return
    setTitle(initial.title ?? '')
    setCalendarId(initial.calendarId ?? writableCalendars[0]?.id ?? '')
    setAllDay(initial.allDay ?? false)
    setStartLocal(toLocalInput(initial.startISO, defaultTz, initial.allDay ?? false))
    setEndLocal(toLocalInput(initial.endISO, defaultTz, initial.allDay ?? false))
    setRrule(initial.rrule ?? null)
    setLocation(initial.location ?? '')
    setConferenceUrl(initial.conferenceUrl ?? '')
    setDescription(initial.description ?? '')
    setGuests(initial.attendees ?? [])
    setReminders(initial.reminders ?? [{ method: 'popup', minutesBefore: 10 }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const startISO = useMemo(() => fromLocalInput(startLocal, timezone, allDay), [startLocal, timezone, allDay])
  const endISO = useMemo(() => {
    if (allDay)
      return (
        DateTime.fromISO(fromLocalInput(endLocal, timezone, true))
          .plus({ days: 1 })
          .toUTC()
          .toISO() ?? endLocal
      )
    return fromLocalInput(endLocal, timezone, allDay)
  }, [endLocal, timezone, allDay])
  const durationMin = Math.max(15, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000))
  const guestMemberIds = guests.map((g) => g.memberId).filter((id): id is string => Boolean(id))

  const isEmail = /^\S+@\S+\.\S+$/.test(guestInput.trim())
  const availableRoster = useMemo(() => {
    const query = guestInput.trim().toLowerCase()
    return roster.filter(
      (m) =>
        !guests.some((g) => g.memberId === m.id) &&
        (!query || m.name.toLowerCase().includes(query) || m.email?.toLowerCase().includes(query)),
    )
  }, [roster, guests, guestInput])

  function pickGuestMember(member: RosterMember) {
    setGuests([...guests, { memberId: member.id, name: member.name, role: 'required' }])
    setGuestInput('')
    setGuestPickerOpen(false)
  }

  function addGuestEmail() {
    const val = guestInput.trim()
    if (!isEmail) {
      toast.error('Pick a teammate or enter a valid email')
      return
    }
    if (!guests.some((g) => g.email === val)) setGuests([...guests, { email: val, name: val, role: 'required' }])
    setGuestInput('')
    setGuestPickerOpen(false)
  }

  async function submit(scope: EditScope = 'all') {
    if (!calendarId) {
      toast.error('Pick a calendar')
      return
    }
    setSaving(true)
    try {
      const body = {
        calendarId,
        title: title.trim() || '(No title)',
        description: description || null,
        location: location || null,
        conferenceUrl: conferenceUrl || null,
        start: startISO,
        end: endISO,
        timezone,
        allDay,
        rrule,
        attendees: guests.map((g) => ({
          memberId: g.memberId ?? undefined,
          email: g.email ?? undefined,
          role: g.role ?? 'required',
        })),
        reminders,
      }
      let res: Response
      if (mode === 'create') {
        res = await fetch('/api/calendar-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch(`/api/calendar-events/${initial.masterId ?? initial.eventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, scope, recurrenceDate: initial.recurrenceDate ?? null }),
        })
        // Reminders are set separately (per-attendee) on edit.
        if (res.ok && initial.eventId) {
          await fetch(`/api/calendar-events/${initial.masterId ?? initial.eventId}/reminders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reminders }),
          })
        }
      }
      if (res.ok) {
        toast.success(mode === 'create' ? 'Event created' : 'Event updated')
        onOpenChange(false)
        onSaved()
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(data?.error ?? 'Could not save the event')
      }
    } finally {
      setSaving(false)
      setScopePrompt(null)
    }
  }

  async function remove(scope: EditScope = 'all') {
    setSaving(true)
    try {
      const qs = new URLSearchParams({ scope })
      if (initial.recurrenceDate) qs.set('recurrenceDate', initial.recurrenceDate)
      const res = await fetch(`/api/calendar-events/${initial.masterId ?? initial.eventId}?${qs.toString()}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Event deleted')
        onOpenChange(false)
        onSaved()
      } else {
        toast.error('Could not delete the event')
      }
    } finally {
      setSaving(false)
      setScopePrompt(null)
    }
  }

  function onSaveClick() {
    if (mode === 'edit' && initial.isRecurring) setScopePrompt('edit')
    else submit('all')
  }
  function onDeleteClick() {
    if (initial.isRecurring) setScopePrompt('delete')
    else remove('all')
  }

  return {
    writableCalendars,
    title,
    setTitle,
    calendarId,
    setCalendarId,
    allDay,
    setAllDay,
    timezone,
    startLocal,
    setStartLocal,
    endLocal,
    setEndLocal,
    rrule,
    setRrule,
    location,
    setLocation,
    conferenceUrl,
    setConferenceUrl,
    description,
    setDescription,
    guests,
    setGuests,
    reminders,
    setReminders,
    guestInput,
    setGuestInput,
    guestPickerOpen,
    setGuestPickerOpen,
    saving,
    scopePrompt,
    setScopePrompt,
    startISO,
    endISO,
    durationMin,
    guestMemberIds,
    isEmail,
    availableRoster,
    pickGuestMember,
    addGuestEmail,
    submit,
    remove,
    onSaveClick,
    onDeleteClick,
  }
}
