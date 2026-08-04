import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { DocAncestor } from '@/lib/docs/tree'

export function DocBreadcrumb({ ancestors }: { ancestors: DocAncestor[] }) {
  if (ancestors.length === 0) return null

  return (
    <nav className="flex items-center gap-1 overflow-x-auto px-4 pt-3 text-xs text-muted-foreground lg:px-6">
      <Link href="/docs" className="shrink-0 hover:text-foreground">
        Docs
      </Link>
      {ancestors.map((a) => (
        <span key={a.id} className="flex shrink-0 items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0" />
          <Link href={`/docs/${a.id}`} className="max-w-[160px] truncate hover:text-foreground">
            {a.title || 'Untitled'}
          </Link>
        </span>
      ))}
    </nav>
  )
}
