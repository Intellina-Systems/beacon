'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const PublicDocView = dynamic(() => import('./public-doc-view').then((mod) => mod.PublicDocView), {
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

export function PublicDocViewClient({ title, content }: { title: string; content: unknown[] }) {
  return <PublicDocView title={title} content={content} />
}
