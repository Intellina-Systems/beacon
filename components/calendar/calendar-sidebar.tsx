import { CalendarPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CalendarList } from './sidebar/calendar-list'
import { CreateCalendarDialog } from './sidebar/create-calendar-dialog'
import { ShareCalendarDialog } from './sidebar/share-calendar-dialog'
import { DeleteCalendarAlert } from './sidebar/delete-calendar-alert'
import type { CalendarSummary } from './types'

export function CalendarSidebar({
  calendars,
  hidden,
  onToggleHidden,
  onCreateClick,
  importInputRef,
  onImportFileChosen,
  onImport,
  onShare,
  onDelete,
  onCreateEvent,
  createCalendarOpen,
  onCreateCalendarOpenChange,
  newCalendarName,
  onNewCalendarNameChange,
  creatingCalendar,
  onSubmitCreateCalendar,
  shareTargetId,
  onShareTargetIdChange,
  shareEmail,
  onShareEmailChange,
  sharing,
  onSubmitShare,
  deleteTargetId,
  onDeleteTargetIdChange,
  onConfirmDeleteCalendar,
}: {
  calendars: CalendarSummary[]
  hidden: Set<string>
  onToggleHidden: (id: string) => void
  onCreateClick: () => void
  importInputRef: React.RefObject<HTMLInputElement | null>
  onImportFileChosen: (file: File) => void
  onImport: (id: string) => void
  onShare: (id: string) => void
  onDelete: (id: string) => void
  onCreateEvent: () => void
  createCalendarOpen: boolean
  onCreateCalendarOpenChange: (open: boolean) => void
  newCalendarName: string
  onNewCalendarNameChange: (value: string) => void
  creatingCalendar: boolean
  onSubmitCreateCalendar: () => void
  shareTargetId: string | null
  onShareTargetIdChange: (id: string | null) => void
  shareEmail: string
  onShareEmailChange: (value: string) => void
  sharing: boolean
  onSubmitShare: () => void
  deleteTargetId: string | null
  onDeleteTargetIdChange: (id: string | null) => void
  onConfirmDeleteCalendar: () => void
}) {
  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col gap-4 border-r p-4 lg:flex">
        <Button onClick={onCreateEvent}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create
        </Button>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="micro-label">Calendars</p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={onCreateClick}
              title="New calendar"
            >
              <CalendarPlus className="h-4 w-4" />
            </Button>
          </div>
          <CalendarList
            calendars={calendars}
            hidden={hidden}
            onToggleHidden={onToggleHidden}
            onImport={onImport}
            onShare={onShare}
            onDelete={onDelete}
          />
        </div>
        <Input
          ref={importInputRef}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImportFileChosen(file)
            e.target.value = ''
          }}
        />
      </aside>

      <CreateCalendarDialog
        open={createCalendarOpen}
        onOpenChange={onCreateCalendarOpenChange}
        name={newCalendarName}
        onNameChange={onNewCalendarNameChange}
        creating={creatingCalendar}
        onSubmit={onSubmitCreateCalendar}
      />

      <ShareCalendarDialog
        open={shareTargetId !== null}
        onOpenChange={(open) => !open && onShareTargetIdChange(null)}
        email={shareEmail}
        onEmailChange={onShareEmailChange}
        sharing={sharing}
        onSubmit={onSubmitShare}
      />

      <DeleteCalendarAlert
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && onDeleteTargetIdChange(null)}
        onConfirm={onConfirmDeleteCalendar}
      />
    </>
  )
}
