'use client'

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'

interface PresenceMember {
  memberId: string
  name: string
}

const HEARTBEAT_MS = 15_000

// Best-effort, polling-based — see lib/db/schema.ts's docPresence comment
// for why this isn't a websocket. A failed heartbeat just means this tick
// doesn't update; never surfaced as an error to the reader.
export function DocPresence({ docId }: { docId: string }) {
  const [others, setOthers] = useState<PresenceMember[]>([])

  useEffect(() => {
    let active = true

    async function beat() {
      try {
        const res = await fetch(`/api/docs/${docId}/presence`, { method: 'POST' })
        if (!res.ok || !active) return
        const data = await res.json()
        if (active) setOthers(data.others ?? [])
      } catch {
        // best-effort
      }
    }

    void beat()
    const interval = setInterval(beat, HEARTBEAT_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [docId])

  if (others.length === 0) return null

  const label = others.length === 1 ? `${others[0].name} is also here` : `${others.length} others are also here`

  return (
    <span
      className="flex items-center gap-1 text-xs text-muted-foreground"
      title={others.map((o) => o.name).join(', ')}
    >
      <Users className="h-3 w-3" />
      {label}
    </span>
  )
}
