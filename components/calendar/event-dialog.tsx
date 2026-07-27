'use client'

import { useEffect, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { Bell, CalendarDays, Clock, MapPin, Repeat, Trash2, Users, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { RecurrenceEditor } from './recurrence-editor'
import { EditScopeDialog } from './edit-scope-dialog'
import { GuestAvailability } from './guest-availability'
import type { AttendeeValue, CalendarSummary, EditScope, ReminderValue, RosterMember } from './types'

export interface EventDialogInitial {
  eventId?: string
  masterId?: string
  calendarId?: string
  title?: string
  description?: string | null
  location?: string | null
  conferenceUrl?: string | null
  startISO: string
  endISO: string
  allDay?: boolean
  timezone?: string
  rrule?: string | null
  isRecurring?: boolean
  recurrenceDate?: string | null
  attendees?: AttendeeValue[]
  reminders?: ReminderValue[]
  readOnly?: boolean
}

const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 1440]

function toLocalInput(iso: string, zone: string, allDay: boolean): string {
  const dt = DateTime.fromISO(iso).setZone(zone)
  return allDay ? dt.toFormat('yyyy-MM-dd') : dt.toFormat("yyyy-MM-dd'T'HH:mm")
}

function fromLocalInput(local: string, zone: string, allDay: boolean): string {
  const dt = allDay
    ? DateTime.fromFormat(local, 'yyyy-MM-dd', { zone }).startOf('day')
    : DateTime.fromFormat(local, "yyyy-MM-dd'T'HH:mm", { zone })
  return dt.toUTC().toISO() ?? new Date(local).toISOString()
}

export function EventDialog({
  open,
  onOpenChange,
  mode,
  initial,
  calendars,
  roster,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initial: EventDialogInitial
  calendars: CalendarSummary[]
  roster: RosterMember[]
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

  const readOnly = initial.readOnly
  const responseLabel: Record<string, string> = {
    accepted: '✓',
    declined: '✗',
    tentative: '?',
    needsAction: '·',
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'New event' : readOnly ? 'Event' : 'Edit event'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add title"
              disabled={readOnly}
              autoFocus
            />

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                type={allDay ? 'date' : 'datetime-local'}
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                disabled={readOnly}
                className="h-8 min-w-0 flex-1"
              />
              <span className="shrink-0 text-muted-foreground">→</span>
              <Input
                type={allDay ? 'date' : 'datetime-local'}
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                disabled={readOnly}
                className="h-8 min-w-0 flex-1"
              />
            </div>
            <div className="flex items-center gap-2 pl-6">
              <Switch id="allday" checked={allDay} onCheckedChange={setAllDay} disabled={readOnly} />
              <Label htmlFor="allday" className="text-sm text-muted-foreground">
                All day
              </Label>
              <span className="ml-auto text-xs text-muted-foreground">{timezone}</span>
            </div>

            <div className="flex items-start gap-2">
              <Repeat className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
              {readOnly ? (
                <p className="text-sm text-muted-foreground">{rrule ? 'Repeats' : 'Does not repeat'}</p>
              ) : (
                <RecurrenceEditor value={rrule} start={new Date(startISO)} onChange={setRrule} />
              )}
            </div>

            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={calendarId} onValueChange={setCalendarId} disabled={readOnly}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Calendar" />
                </SelectTrigger>
                <SelectContent>
                  {writableCalendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!readOnly && (
              <div className="flex items-start gap-2">
                <Users className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 space-y-2">
                  <Popover open={guestPickerOpen} onOpenChange={setGuestPickerOpen}>
                    <PopoverTrigger asChild>
                      <Input
                        value={guestInput}
                        onChange={(e) => {
                          setGuestInput(e.target.value)
                          setGuestPickerOpen(true)
                        }}
                        onFocus={() => setGuestPickerOpen(true)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGuestEmail())}
                        placeholder="Add guests (teammate or email)"
                        className="h-8"
                      />
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-(--radix-popover-trigger-width) p-0"
                      align="start"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <Command shouldFilter={false}>
                        <CommandList>
                          <CommandEmpty>
                            {isEmail ? (
                              <Button type="button" variant="ghost" size="sm" onClick={addGuestEmail}>
                                Add &ldquo;{guestInput.trim()}&rdquo;
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">No teammate found.</span>
                            )}
                          </CommandEmpty>
                          {availableRoster.length > 0 && (
                            <CommandGroup>
                              {availableRoster.map((m) => (
                                <CommandItem key={m.id} value={m.id} onSelect={() => pickGuestMember(m)}>
                                  <span>{m.name}</span>
                                  {m.email && <span className="text-muted-foreground">{m.email}</span>}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {guests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {guests.map((g, i) => (
                        <span
                          key={g.memberId ?? g.email ?? i}
                          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2 pr-1 text-xs"
                        >
                          {g.responseStatus ? (
                            <span className="text-muted-foreground">{responseLabel[g.responseStatus] ?? '·'}</span>
                          ) : null}
                          {g.name ?? g.email}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                            onClick={() => setGuests(guests.filter((_, j) => j !== i))}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </span>
                      ))}
                    </div>
                  )}
                  {guestMemberIds.length > 0 && (
                    <GuestAvailability
                      memberIds={guestMemberIds}
                      fromISO={startISO}
                      durationMin={durationMin}
                      timezone={timezone}
                      onPick={(s, e) => {
                        setStartLocal(toLocalInput(s, timezone, allDay))
                        setEndLocal(toLocalInput(e, timezone, allDay))
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location"
                disabled={readOnly}
                className="h-8"
              />
            </div>

            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={conferenceUrl}
                onChange={(e) => setConferenceUrl(e.target.value)}
                placeholder="Add a video call link"
                disabled={readOnly}
                className="h-8"
              />
            </div>

            {!readOnly && (
              <div className="flex items-start gap-2">
                <Bell className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 space-y-1.5">
                  {reminders.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select
                        value={String(r.minutesBefore)}
                        onValueChange={(v) =>
                          setReminders(reminders.map((x, j) => (j === i ? { ...x, minutesBefore: Number(v) } : x)))
                        }
                      >
                        <SelectTrigger className="h-8 w-[150px] text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REMINDER_PRESETS.map((m) => (
                            <SelectItem key={m} value={String(m)}>
                              {m === 0 ? 'At time of event' : m >= 1440 ? `${m / 1440} day before` : `${m} min before`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setReminders(reminders.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {reminders.length < 5 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="-ml-2 text-muted-foreground"
                      onClick={() => setReminders([...reminders, { method: 'popup', minutesBefore: 30 }])}
                    >
                      Add reminder
                    </Button>
                  )}
                </div>
              </div>
            )}

            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              disabled={readOnly}
              className="min-h-16 text-sm"
            />
          </div>

          <DialogFooter className={cn('gap-2', mode === 'edit' && !readOnly && 'sm:justify-between')}>
            {mode === 'edit' && !readOnly && (
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={onDeleteClick}
                disabled={saving}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {readOnly ? 'Close' : 'Cancel'}
              </Button>
              {!readOnly && (
                <Button onClick={onSaveClick} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditScopeDialog
        open={scopePrompt !== null}
        action={scopePrompt ?? 'edit'}
        onCancel={() => setScopePrompt(null)}
        onConfirm={(scope) => (scopePrompt === 'delete' ? remove(scope) : submit(scope))}
      />
    </>
  )
}
