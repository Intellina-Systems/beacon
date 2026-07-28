import { useState } from 'react'
import { Eye, EyeOff, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { RosterOption, WatcherEntry } from '@/lib/work-items/types'

export function WorkItemWatchers({
  watchers,
  roster,
  currentMemberId,
  onToggleWatch,
  onAddWatcher,
  onRemoveWatcher,
}: {
  watchers: WatcherEntry[]
  roster: RosterOption[]
  currentMemberId: string
  onToggleWatch: (watching: boolean) => void
  onAddWatcher: (memberId: string) => void
  onRemoveWatcher: (memberId: string) => void
}) {
  const [addWatcherId, setAddWatcherId] = useState('')
  const isWatching = watchers.some((w) => w.memberId === currentMemberId)
  const watcherIds = new Set(watchers.map((w) => w.memberId))

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center justify-between">
        <Label className="micro-label">Watchers</Label>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => onToggleWatch(isWatching)}>
          {isWatching ? (
            <>
              <EyeOff className="mr-1 h-3 w-3" />
              Unwatch
            </>
          ) : (
            <>
              <Eye className="mr-1 h-3 w-3" />
              Watch
            </>
          )}
        </Button>
      </div>
      <div className="space-y-1">
        {watchers.map((w) => (
          <div key={w.memberId} className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate">
              {w.name} <span className="text-muted-foreground">· {w.reason}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={() => onRemoveWatcher(w.memberId)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Select value={addWatcherId} onValueChange={setAddWatcherId}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue placeholder="Add a watcher…" />
          </SelectTrigger>
          <SelectContent>
            {roster
              .filter((m) => !watcherIds.has(m.id))
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0 px-2"
          disabled={!addWatcherId}
          onClick={() => {
            onAddWatcher(addWatcherId)
            setAddWatcherId('')
          }}
        >
          <UserPlus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
