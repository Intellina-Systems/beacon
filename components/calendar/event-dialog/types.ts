import type { AttendeeValue, ReminderValue } from '../types'

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
