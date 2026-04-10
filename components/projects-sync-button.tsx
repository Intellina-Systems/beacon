'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

export function ProjectsSyncButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSync = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/linear/sync', { method: 'POST' })
      const data = (await res.json()) as { projectsSynced?: number; issuesSynced?: number }
      if (res.ok) {
        router.refresh()
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleSync} disabled={loading}>
      <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Syncing…' : 'Sync'}
    </Button>
  )
}
