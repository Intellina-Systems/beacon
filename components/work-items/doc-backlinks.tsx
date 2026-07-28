'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText } from 'lucide-react'
import { relativeTime } from '@/lib/utils/relative-time'

interface BacklinkDoc {
  id: string
  title: string
  updatedAt: string
  ownerName: string
}

/**
 * "Referenced in" — the docs that mention this work item. Renders nothing until
 * there is something to show, so an item nobody has written about stays quiet
 * rather than displaying an empty heading.
 */
export function DocBacklinks({ workItemId }: { workItemId: string }) {
  const [docs, setDocs] = useState<BacklinkDoc[]>([])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const res = await fetch(`/api/work-items/${encodeURIComponent(workItemId)}/backlinks`)
        if (!res.ok) return
        const data = (await res.json()) as { docs: BacklinkDoc[] }
        if (active) setDocs(data.docs)
      } catch {
        // Backlinks are supplementary; a failure shouldn't disturb the item view.
      }
    })()
    return () => {
      active = false
    }
  }, [workItemId])

  if (docs.length === 0) return null

  return (
    <section>
      <p className="micro-label mb-2">Referenced in {docs.length === 1 ? '1 doc' : `${docs.length} docs`}</p>
      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        {docs.map((doc) => (
          <Link
            key={doc.id}
            href={`/docs/${doc.id}`}
            className="flex items-center gap-3 px-3 py-2 transition-colors duration-150 hover:bg-accent/60"
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm">{doc.title || 'Untitled'}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{doc.ownerName}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(new Date(doc.updatedAt))}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
