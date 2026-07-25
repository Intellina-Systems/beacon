export type EditScope = 'single' | 'following' | 'all'

export interface CalendarSummary {
  id: string
  name: string
  color: string
  timezone: string
  isPrimary: boolean
  visibility: 'private' | 'workspace'
  mine: boolean
  externalProvider: string | null
  readOnly: boolean
}

export interface RosterMember {
  id: string
  name: string
  email: string | null
}

export interface FeedEvent {
  id: string
  masterId: string
  calendarId: string
  title: string
  start: string
  end: string
  allDay: boolean
  color: string | null
  location: string | null
  status: string
  isRecurring: boolean
  originalStart: string | null
  attendeeCount: number
  myResponse: string | null
  readOnly: boolean
  conferenceUrl: string | null
}

export interface ReminderValue {
  method: 'popup' | 'email'
  minutesBefore: number
}

export interface AttendeeValue {
  memberId?: string | null
  email?: string | null
  name?: string | null
  responseStatus?: string
  role?: 'required' | 'optional'
}
