'use client'

import { useCallback, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { DateTime } from 'luxon'
import { CalendarPlus, Download, MoreHorizontal, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { EventDialog, type EventDialogInitial } from './event-dialog'
import type { AttendeeValue, CalendarSummary, ReminderValue, RosterMember } from './types'

// FullCalendar theming mapped onto Beacon's design tokens (works light + dark).
const FC_THEME: React.CSSProperties = {
  ['--fc-border-color' as string]: 'var(--border)',
  ['--fc-page-bg-color' as string]: 'var(--background)',
  ['--fc-neutral-bg-color' as string]: 'var(--muted)',
  ['--fc-today-bg-color' as string]: 'color-mix(in oklch, var(--beacon) 8%, transparent)',
  ['--fc-now-indicator-color' as string]: 'var(--destructive)',
  ['--fc-event-border-color' as string]: 'transparent',
  ['--fc-list-event-hover-bg-color' as string]: 'var(--accent)',
  color: 'var(--foreground)',
}

export function CalendarApp({
  calendars: initialCalendars,
  roster,
  defaultTimezone,
}: {
  calendars: CalendarSummary[]
  roster: RosterMember[]
  defaultTimezone: string
}) {
  const calendarRef = useRef<FullCalendar>(null)
  const [calendars, setCalendars] = useState(initialCalendars)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [dialogInitial, setDialogInitial] = useState<EventDialogInitial | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const activeCalendarIds = calendars.filter((c) => !hidden.has(c.id)).map((c) => c.id)

  const refetch = useCallback(() => calendarRef.current?.getApi().refetchEvents(), [])

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

  async function createCalendar() {
    const name = window.prompt('New calendar name')?.trim()
    if (!name) return
    const res = await fetch('/api/calendars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, timezone: defaultTimezone }),
    })
    if (res.ok) {
      const list = await (await fetch('/api/calendars')).json()
      setCalendars(list.calendars)
      toast.success('Calendar created')
    }
  }

  async function shareCalendar(id: string) {
    const email = window.prompt('Share with (teammate email)')?.trim()
    if (!email) return
    const member = roster.find((m) => m.email?.toLowerCase() === email.toLowerCase())
    const res = await fetch(`/api/calendars/${id}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(member ? { memberId: member.id, role: 'reader' } : { email, role: 'reader' }),
    })
    if (res.ok) toast.success('Calendar shared')
    else toast.error('Could not share')
  }

  async function deleteCalendar(id: string) {
    if (!window.confirm('Delete this calendar and all its events?')) return
    const res = await fetch(`/api/calendars/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setCalendars(calendars.filter((c) => c.id !== id))
      refetch()
      toast.success('Calendar deleted')
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      toast.error(data?.error ?? 'Could not delete')
    }
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
      refetch()
    } else {
      toast.error('Import failed')
    }
  }

  const [importTargetId, setImportTargetId] = useState<string | null>(null)

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col gap-4 border-r p-4 lg:flex">
        <Button
          onClick={() => openCreate(new Date().toISOString(), new Date(Date.now() + 3600000).toISOString(), false)}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Create
        </Button>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="micro-label">Calendars</p>
            <button
              onClick={createCalendar}
              title="New calendar"
              className="text-muted-foreground hover:text-foreground"
            >
              <CalendarPlus className="h-4 w-4" />
            </button>
          </div>
          {calendars.map((c) => (
            <div key={c.id} className="group flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/50">
              <input
                type="checkbox"
                checked={!hidden.has(c.id)}
                onChange={() =>
                  setHidden((prev) => {
                    const next = new Set(prev)
                    if (next.has(c.id)) next.delete(c.id)
                    else next.add(c.id)
                    return next
                  })
                }
                style={{ accentColor: c.color }}
                className="h-3.5 w-3.5"
              />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="flex-1 truncate">{c.name}</span>
              <DropdownMenu>
                <DropdownMenuTrigger className="text-muted-foreground opacity-0 group-hover:opacity-100">
                  <MoreHorizontal className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href={`/api/calendars/${c.id}/export`} download>
                      <Download className="mr-2 h-3.5 w-3.5" />
                      Export .ics
                    </a>
                  </DropdownMenuItem>
                  {!c.readOnly && (
                    <DropdownMenuItem
                      onClick={() => {
                        setImportTargetId(c.id)
                        importInputRef.current?.click()
                      }}
                    >
                      <Upload className="mr-2 h-3.5 w-3.5" />
                      Import .ics
                    </DropdownMenuItem>
                  )}
                  {c.mine && <DropdownMenuItem onClick={() => shareCalendar(c.id)}>Share</DropdownMenuItem>}
                  {c.mine && !c.isPrimary && (
                    <DropdownMenuItem className="text-destructive" onClick={() => deleteCalendar(c.id)}>
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file && importTargetId) importIcs(file, importTargetId)
            e.target.value = ''
          }}
        />
      </aside>

      {/* Grid */}
      <div className="min-w-0 flex-1 p-3" style={FC_THEME}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          height="100%"
          nowIndicator
          selectable
          selectMirror
          editable
          dayMaxEvents
          weekNumbers={false}
          slotMinTime="06:00:00"
          scrollTime="08:00:00"
          events={fetchEvents}
          select={handleSelect}
          eventClick={handleEventClick}
          eventDrop={handleTimeChange}
          eventResize={handleTimeChange}
        />
      </div>

      {dialogInitial && (
        <EventDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={dialogMode}
          initial={dialogInitial}
          calendars={calendars}
          roster={roster}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
