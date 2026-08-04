'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function NewDocButton({ parentId, label = 'New document' }: { parentId?: string; label?: string }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  async function create() {
    setCreating(true)
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parentId ? { parentId } : {}),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/docs/${data.doc.id}`)
      } else {
        toast.error('Failed to create document')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <Button size="sm" variant={parentId ? 'outline' : 'default'} onClick={create} disabled={creating}>
      <Plus className="mr-1.5 h-3.5 w-3.5" />
      {creating ? 'Creating…' : label}
    </Button>
  )
}
