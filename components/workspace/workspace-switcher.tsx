'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface Membership {
  workspaceId: string
  workspaceName: string
}

/**
 * Sidebar workspace name — becomes a switcher dropdown once the signed-in
 * account belongs to more than one workspace (e.g. invited into a second org
 * with the same login). Single-workspace accounts see plain text, unchanged.
 */
export function WorkspaceSwitcher({
  currentWorkspaceId,
  currentWorkspaceName,
  memberships,
}: {
  currentWorkspaceId: string
  currentWorkspaceName: string
  memberships: Membership[]
}) {
  const router = useRouter()
  const [switching, setSwitching] = useState<string | null>(null)

  if (memberships.length <= 1) {
    return (
      <p className="min-w-0 truncate text-sm font-semibold text-sidebar-foreground" title={currentWorkspaceName}>
        {currentWorkspaceName}
      </p>
    )
  }

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1 text-left text-sm font-semibold text-sidebar-foreground transition-opacity hover:opacity-80"
        >
          <span className="min-w-0 truncate" title={currentWorkspaceName}>
            {currentWorkspaceName}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 text-sidebar-foreground/50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.workspaceId}
            onClick={() => switchTo(m.workspaceId)}
            className={cn('flex items-center justify-between gap-2', switching && 'pointer-events-none opacity-60')}
          >
            <span className="truncate">{m.workspaceName}</span>
            {switching === m.workspaceId ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : m.workspaceId === currentWorkspaceId ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-beacon" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
