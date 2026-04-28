'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function IssuesSyncButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSync = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/linear/issues/sync', { method: 'POST' })
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
