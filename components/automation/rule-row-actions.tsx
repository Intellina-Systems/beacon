'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

export function RuleRowActions({ ruleId, enabled }: { ruleId: string; enabled: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function toggle(next: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/automation-rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (res.ok) router.refresh()
      else toast.error('Failed to update rule')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Delete this rule?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/automation-rules/${ruleId}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
      else toast.error('Failed to delete rule')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={enabled} disabled={busy} onCheckedChange={toggle} />
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" disabled={busy} onClick={remove}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
