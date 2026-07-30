'use client'

import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ManageTeamDialog, type RosterMember, type TeamWithMembers } from '@/components/teams/teams-section'

/**
 * Opens the same Manage dialog the /org list uses, from a team's own detail
 * page. Owns the open state so the dialog unmounts cleanly on close — the
 * caller (a server component) only decides whether to render the button.
 */
export function ManageTeamButton({
  team,
  roster,
  isWorkspaceAdmin,
}: {
  team: TeamWithMembers
  roster: RosterMember[]
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
        <ManageTeamDialog
          team={team}
          roster={roster}
          isWorkspaceAdmin={isWorkspaceAdmin}
          onOpenChange={() => setOpen(false)}
        />
      )}
    </>
  )
}
