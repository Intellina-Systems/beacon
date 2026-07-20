'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import type { Doc } from '@/lib/db/schema'

// BlockNote touches the DOM/selection APIs at module init and must never run
// during SSR — ssr:false is only legal from within a Client Component, hence
// this wrapper being the boundary rather than the page itself.
const DocEditor = dynamic(() => import('./doc-editor').then((mod) => mod.DocEditor), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-0">
      <Skeleton className="mb-6 h-9 w-2/3" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="mb-2 h-4 w-5/6" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  ),
})

export function DocEditorClient({ doc, editable }: { doc: Doc; editable: boolean }) {
  return <DocEditor doc={doc} editable={editable} />
}
