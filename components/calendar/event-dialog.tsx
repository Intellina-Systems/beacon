'use client'

import { CalendarDays, Clock, MapPin, Repeat, Trash2, Video } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { RecurrenceEditor } from './recurrence-editor'
import { EditScopeDialog } from './edit-scope-dialog'
import { GuestPicker } from './event-dialog/guest-picker'
import { RemindersField } from './event-dialog/reminders-field'
import { useEventForm } from './event-dialog/use-event-form'
import { toLocalInput } from '@/lib/calendar/local-time'
import type { CalendarSummary, RosterMember } from './types'
import type { EventDialogInitial } from './event-dialog/types'

export type { EventDialogInitial } from './event-dialog/types'

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
  const form = useEventForm({ open, mode, initial, calendars, roster, onOpenChange, onSaved })
  const readOnly = initial.readOnly

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'New event' : readOnly ? 'Event' : 'Edit event'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              value={form.title}
              onChange={(e) => form.setTitle(e.target.value)}
              placeholder="Add title"
              disabled={readOnly}
              autoFocus
            />

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                type={form.allDay ? 'date' : 'datetime-local'}
                value={form.startLocal}
                onChange={(e) => form.setStartLocal(e.target.value)}
                disabled={readOnly}
                className="h-8 min-w-0 flex-1"
              />
              <span className="shrink-0 text-muted-foreground">→</span>
              <Input
                type={form.allDay ? 'date' : 'datetime-local'}
                value={form.endLocal}
                onChange={(e) => form.setEndLocal(e.target.value)}
                disabled={readOnly}
                className="h-8 min-w-0 flex-1"
              />
            </div>
            <div className="flex items-center gap-2 pl-6">
              <Switch id="allday" checked={form.allDay} onCheckedChange={form.setAllDay} disabled={readOnly} />
              <Label htmlFor="allday" className="text-sm text-muted-foreground">
                All day
              </Label>
              <span className="ml-auto text-xs text-muted-foreground">{form.timezone}</span>
            </div>

            <div className="flex items-start gap-2">
              <Repeat className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
              {readOnly ? (
                <p className="text-sm text-muted-foreground">{form.rrule ? 'Repeats' : 'Does not repeat'}</p>
              ) : (
                <RecurrenceEditor value={form.rrule} start={new Date(form.startISO)} onChange={form.setRrule} />
              )}
            </div>

            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={form.calendarId} onValueChange={form.setCalendarId} disabled={readOnly}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Calendar" />
                </SelectTrigger>
                <SelectContent>
                  {form.writableCalendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!readOnly && (
              <GuestPicker
                guests={form.guests}
                onGuestsChange={form.setGuests}
                guestInput={form.guestInput}
                onGuestInputChange={form.setGuestInput}
                guestPickerOpen={form.guestPickerOpen}
                onGuestPickerOpenChange={form.setGuestPickerOpen}
                isEmail={form.isEmail}
                availableRoster={form.availableRoster}
                onPickMember={form.pickGuestMember}
                onAddEmail={form.addGuestEmail}
                guestMemberIds={form.guestMemberIds}
                startISO={form.startISO}
                durationMin={form.durationMin}
                timezone={form.timezone}
                onPickAvailability={(s, e) => {
                  form.setStartLocal(toLocalInput(s, form.timezone, form.allDay))
                  form.setEndLocal(toLocalInput(e, form.timezone, form.allDay))
                }}
              />
            )}

            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={form.location}
                onChange={(e) => form.setLocation(e.target.value)}
                placeholder="Add location"
                disabled={readOnly}
                className="h-8"
              />
            </div>

            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={form.conferenceUrl}
                onChange={(e) => form.setConferenceUrl(e.target.value)}
                placeholder="Add a video call link"
                disabled={readOnly}
                className="h-8"
              />
            </div>

            {!readOnly && <RemindersField reminders={form.reminders} onRemindersChange={form.setReminders} />}

            <Textarea
              value={form.description}
              onChange={(e) => form.setDescription(e.target.value)}
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
                onClick={form.onDeleteClick}
                disabled={form.saving}
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
                <Button onClick={form.onSaveClick} disabled={form.saving}>
                  {form.saving ? 'Saving…' : 'Save'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditScopeDialog
        open={form.scopePrompt !== null}
        action={form.scopePrompt ?? 'edit'}
        onCancel={() => form.setScopePrompt(null)}
        onConfirm={(scope) => (form.scopePrompt === 'delete' ? form.remove(scope) : form.submit(scope))}
      />
    </>
  )
}
