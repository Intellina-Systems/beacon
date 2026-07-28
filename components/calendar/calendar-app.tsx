'use client'

import { useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { CalendarToolbar } from './calendar-toolbar'
import { CalendarSidebar } from './calendar-sidebar'
import { EventDialog } from './event-dialog'
import { useCalendarList } from './use-calendar-list'
import { useCalendarGrid } from './use-calendar-grid'
import type { CalendarSummary, RosterMember } from './types'
import './calendar.css'

export function CalendarApp({
  calendars: initialCalendars,
  roster,
  defaultTimezone,
}: {
  calendars: CalendarSummary[]
  roster: RosterMember[]
  defaultTimezone: string
}) {
  const list = useCalendarList({
    initialCalendars,
    roster,
    defaultTimezone,
    onCalendarsMutated: () => grid.refetch(),
  })
  const activeCalendarIds = list.calendars.filter((c) => !list.hidden.has(c.id)).map((c) => c.id)
  const calendarRef = useRef<FullCalendar>(null)
  const grid = useCalendarGrid({ calendarRef, calendars: list.calendars, activeCalendarIds, defaultTimezone })
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importTargetId, setImportTargetId] = useState<string | null>(null)

  return (
    <div className="flex h-full min-h-0">
      <CalendarSidebar
        calendars={list.calendars}
        hidden={list.hidden}
        onToggleHidden={list.toggleHidden}
        onCreateClick={() => list.setCreateCalendarOpen(true)}
        importInputRef={importInputRef}
        onImportFileChosen={(file) => importTargetId && list.importIcs(file, importTargetId)}
        onImport={(id) => {
          setImportTargetId(id)
          importInputRef.current?.click()
        }}
        onShare={(id) => {
          list.setShareTargetId(id)
          list.setShareEmail('')
        }}
        onDelete={(id) => list.setDeleteTargetId(id)}
        onCreateEvent={() =>
          grid.openCreate(new Date().toISOString(), new Date(Date.now() + 3600000).toISOString(), false)
        }
        createCalendarOpen={list.createCalendarOpen}
        onCreateCalendarOpenChange={list.setCreateCalendarOpen}
        newCalendarName={list.newCalendarName}
        onNewCalendarNameChange={list.setNewCalendarName}
        creatingCalendar={list.creatingCalendar}
        onSubmitCreateCalendar={list.submitCreateCalendar}
        shareTargetId={list.shareTargetId}
        onShareTargetIdChange={list.setShareTargetId}
        shareEmail={list.shareEmail}
        onShareEmailChange={list.setShareEmail}
        sharing={list.sharing}
        onSubmitShare={list.submitShare}
        deleteTargetId={list.deleteTargetId}
        onDeleteTargetIdChange={list.setDeleteTargetId}
        onConfirmDeleteCalendar={list.confirmDeleteCalendar}
      />

      {/* Grid */}
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <CalendarToolbar
          title={grid.title}
          view={grid.view}
          onPrev={grid.goPrev}
          onNext={grid.goNext}
          onToday={grid.goToday}
          onViewChange={grid.changeView}
        />
        <div className="beacon-calendar min-h-0 flex-1">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={false}
            height="100%"
            nowIndicator
            selectable
            selectMirror
            editable
            dayMaxEvents
            weekNumbers={false}
            slotMinTime="06:00:00"
            scrollTime="08:00:00"
            events={grid.fetchEvents}
            datesSet={grid.handleDatesSet}
            select={grid.handleSelect}
            eventClick={grid.handleEventClick}
            eventDrop={grid.handleTimeChange}
            eventResize={grid.handleTimeChange}
          />
        </div>
      </div>

      {grid.dialogInitial && (
        <EventDialog
          open={grid.dialogOpen}
          onOpenChange={grid.setDialogOpen}
          mode={grid.dialogMode}
          initial={grid.dialogInitial}
          calendars={list.calendars}
          roster={roster}
          onSaved={grid.refetch}
        />
      )}
    </div>
  )
}
