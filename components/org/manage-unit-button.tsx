'use client'

import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ManageUnitDialog, type OrgUnit, type RosterOption } from '@/components/org/org-unit-section'

/**
 * Opens the same Manage dialog the /org list uses, from an engine or team's own
 * detail page. Owns the open state so the dialog unmounts cleanly on close —
 * the caller (a server component) only decides whether to render the button.
 */
export function ManageUnitButton({
  label,
  apiBase,
  unit,
  roster,
  isWorkspaceAdmin,
}: {
  label: string
  apiBase: string
  unit: OrgUnit
  roster: RosterOption[]
  isWorkspaceAdmin: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="mr-1 h-4 w-4" />
        Manage
      </Button>
      {open && (
        <ManageUnitDialog
          label={label}
          apiBase={apiBase}
          unit={unit}
          roster={roster}
          isWorkspaceAdmin={isWorkspaceAdmin}
          onOpenChange={() => setOpen(false)}
        />
      )}
    </>
  )
}
