'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import type { EditScope } from './types'

export function EditScopeDialog({
  open,
  action,
  onCancel,
  onConfirm,
}: {
  open: boolean
  action: 'edit' | 'delete'
  onCancel: () => void
  onConfirm: (scope: EditScope) => void
}) {
  const [scope, setScope] = useState<EditScope>('single')

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{action === 'delete' ? 'Delete recurring event' : 'Edit recurring event'}</DialogTitle>
        </DialogHeader>
        <RadioGroup value={scope} onValueChange={(v) => setScope(v as EditScope)} className="gap-3 py-2">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="single" id="scope-single" />
            <Label htmlFor="scope-single">This event</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="following" id="scope-following" />
            <Label htmlFor="scope-following">This and following events</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="scope-all" />
            <Label htmlFor="scope-all">All events</Label>
          </div>
        </RadioGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={action === 'delete' ? 'destructive' : 'default'} onClick={() => onConfirm(scope)}>
            {action === 'delete' ? 'Delete' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
