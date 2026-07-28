import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ReminderValue } from '../types'

const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 1440]

export function RemindersField({
  reminders,
  onRemindersChange,
}: {
  reminders: ReminderValue[]
  onRemindersChange: (reminders: ReminderValue[]) => void
}) {
  return (
    <div className="flex items-start gap-2">
      <Bell className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 space-y-1.5">
        {reminders.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              value={String(r.minutesBefore)}
              onValueChange={(v) =>
                onRemindersChange(reminders.map((x, j) => (j === i ? { ...x, minutesBefore: Number(v) } : x)))
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
              onClick={() => onRemindersChange(reminders.filter((_, j) => j !== i))}
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
            onClick={() => onRemindersChange([...reminders, { method: 'popup', minutesBefore: 30 }])}
          >
            Add reminder
          </Button>
        )}
      </div>
    </div>
  )
}
