import { useCallback, useState, type RefObject } from 'react'
import type FullCalendar from '@fullcalendar/react'
import type { DateSelectArg, DatesSetArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { toast } from 'sonner'
import type { AttendeeValue, CalendarSummary, ReminderValue } from './types'
import type { EventDialogInitial } from './event-dialog/types'

export function useCalendarGrid({
  calendarRef,
  calendars,
  activeCalendarIds,
  defaultTimezone,
}: {
  calendarRef: RefObject<FullCalendar | null>
  calendars: CalendarSummary[]
  activeCalendarIds: string[]
  defaultTimezone: string
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [dialogInitial, setDialogInitial] = useState<EventDialogInitial | null>(null)
  const [view, setView] = useState('timeGridWeek')
  const [title, setTitle] = useState('')

  const refetch = useCallback(() => calendarRef.current?.getApi().refetchEvents(), [calendarRef])
  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setView(arg.view.type)
    setTitle(arg.view.title)
  }, [])
  const goPrev = useCallback(() => calendarRef.current?.getApi().prev(), [calendarRef])
  const goNext = useCallback(() => calendarRef.current?.getApi().next(), [calendarRef])
  const goToday = useCallback(() => calendarRef.current?.getApi().today(), [calendarRef])
  const changeView = useCallback((v: string) => calendarRef.current?.getApi().changeView(v), [calendarRef])

  const fetchEvents = useCallback(
    async (
      info: { startStr: string; endStr: string },
      success: (events: EventInput[]) => void,
      failure: (e: Error) => void,
    ) => {
      try {
        const qs = new URLSearchParams({ start: info.startStr, end: info.endStr })
        if (activeCalendarIds.length) qs.set('calendarIds', activeCalendarIds.join(','))
        const res = await fetch(`/api/calendar-events?${qs.toString()}`)
        const data = (await res.json()) as { events: (EventInput & { color: string | null; readOnly: boolean })[] }
        success(
          data.events.map((e) => ({
            ...e,
            backgroundColor: e.color ?? undefined,
            borderColor: e.color ?? undefined,
            editable: !e.readOnly,
          })),
        )
      } catch (err) {
        failure(err as Error)
      }
    },
    [activeCalendarIds],
  )

  function openCreate(startISO: string, endISO: string, allDay: boolean) {
    setDialogMode('create')
    setDialogInitial({
      startISO,
      endISO,
      allDay,
      timezone: defaultTimezone,
      calendarId: calendars.find((c) => c.mine && c.isPrimary)?.id ?? calendars.find((c) => !c.readOnly)?.id,
    })
    setDialogOpen(true)
  }

  const handleSelect = (arg: DateSelectArg) => {
    openCreate(arg.start.toISOString(), arg.end.toISOString(), arg.allDay)
    arg.view.calendar.unselect()
  }

  async function handleEventClick(arg: EventClickArg) {
    const masterId = (arg.event.extendedProps.masterId as string) ?? arg.event.id
    const originalStart = (arg.event.extendedProps.originalStart as string | null) ?? null
    const readOnly = Boolean(arg.event.extendedProps.readOnly)
    try {
      const res = await fetch(`/api/calendar-events/${masterId}`)
      if (!res.ok) return
      const detail = (await res.json()) as {
        event: {
          id: string
          title: string
          description: string | null
          location: string | null
          conferenceUrl: string | null
          rrule: string | null
          allDay: boolean
          startTimezone: string
        }
        attendees: {
          memberId: string | null
          email: string | null
          name: string | null
          responseStatus: string
          role: 'required' | 'optional'
          isOrganizer: boolean
        }[]
        reminders: ReminderValue[]
      }
      const attendees: AttendeeValue[] = detail.attendees
        .filter((a) => !a.isOrganizer)
        .map((a) => ({
          memberId: a.memberId,
          email: a.email,
          name: a.name ?? a.email,
          responseStatus: a.responseStatus,
          role: a.role,
        }))
      setDialogMode('edit')
      setDialogInitial({
        eventId: arg.event.id,
        masterId,
        calendarId: (arg.event.extendedProps.calendarId as string) ?? undefined,
        title: detail.event.title,
        description: detail.event.description,
        location: detail.event.location,
        conferenceUrl: detail.event.conferenceUrl,
        startISO: arg.event.start?.toISOString() ?? new Date().toISOString(),
        endISO: arg.event.end?.toISOString() ?? arg.event.start?.toISOString() ?? new Date().toISOString(),
        allDay: arg.event.allDay,
        timezone: detail.event.startTimezone,
        rrule: detail.event.rrule,
        isRecurring: Boolean(detail.event.rrule),
        recurrenceDate: originalStart,
        attendees,
        reminders: detail.reminders,
        readOnly,
      })
      setDialogOpen(true)
    } catch {
      toast.error('Could not open the event')
    }
  }

  async function handleTimeChange(arg: EventDropArg | EventResizeDoneArg) {
    const ev = arg.event
    const masterId = (ev.extendedProps.masterId as string) ?? ev.id
    const isRecurring = Boolean(ev.extendedProps.isRecurring)
    const originalStart = (ev.extendedProps.originalStart as string | null) ?? null
    const body = {
      scope: isRecurring ? 'single' : 'all',
      recurrenceDate: originalStart,
      start: ev.start?.toISOString(),
      end: ev.end?.toISOString() ?? ev.start?.toISOString(),
      allDay: ev.allDay,
    }
    const res = await fetch(`/api/calendar-events/${masterId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      arg.revert()
      toast.error('Could not move the event')
    }
  }

  return {
    dialogOpen,
    setDialogOpen,
    dialogMode,
    dialogInitial,
    view,
    title,
    refetch,
    handleDatesSet,
    goPrev,
    goNext,
    goToday,
    changeView,
    fetchEvents,
    openCreate,
    handleSelect,
    handleEventClick,
    handleTimeChange,
  }
}
