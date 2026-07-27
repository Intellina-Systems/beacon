'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface Membership {
  workspaceId: string
  workspaceName: string
}

// Designed to be used as a submenu item inside a DropdownMenu. Only render when
// the account belongs to more than one workspace.
export function SwitchWorkspaceMenu({
  currentWorkspaceId,
  memberships,
}: {
  currentWorkspaceId: string
  memberships: Membership[]
}) {
  const router = useRouter()
  const [switching, setSwitching] = useState<string | null>(null)

  async function switchTo(workspaceId: string) {
    if (workspaceId === currentWorkspaceId || switching) return
    setSwitching(workspaceId)
    try {
      const res = await fetch('/api/workspace/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(body?.error ?? 'Failed to switch workspace')
      }
    } finally {
      setSwitching(null)
    }
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer">
        <Building2 className="mr-2 h-4 w-4" />
        Switch workspace
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.workspaceId}
            onClick={() => switchTo(m.workspaceId)}
            className={cn(
              'flex cursor-pointer items-center justify-between gap-2',
              switching && 'pointer-events-none opacity-60',
            )}
          >
            <span className="truncate">{m.workspaceName}</span>
            {switching === m.workspaceId ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : m.workspaceId === currentWorkspaceId ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-beacon" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
