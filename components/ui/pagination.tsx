import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaginationProps {
  page: number
  pageCount: number
  total: number
  /** Builds the href for a given page — keep other search params intact. */
  hrefFor: (page: number) => string
  className?: string
}

function pageWindow(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const pages = new Set<number>([1, 2, page - 1, page, page + 1, pageCount - 1, pageCount])
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…')
    out.push(sorted[i])
  }
  return out
}

/**
 * Server-rendered, Link-based pagination — works without JS and keeps
 * navigation prefetchable. Renders nothing when there is a single page.
 */
export function Pagination({ page, pageCount, total, hrefFor, className }: PaginationProps) {
  if (pageCount <= 1) return null

  const item =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md border bg-card px-2 text-xs font-medium tabular-nums transition-colors hover:bg-accent'
  const disabled = 'pointer-events-none opacity-40'

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3 px-1 py-3', className)}
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        Page {page} of {pageCount} · {total.toLocaleString()} total
      </p>
      <div className="flex items-center gap-1">
        <Link
          href={hrefFor(page - 1)}
          aria-label="Previous page"
          className={cn(item, page <= 1 && disabled)}
          aria-disabled={page <= 1}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Link>
        {pageWindow(page, pageCount).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={hrefFor(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(item, p === page && 'border-beacon/50 bg-beacon/10 text-foreground')}
            >
              {p}
            </Link>
          ),
        )}
        <Link
          href={hrefFor(page + 1)}
          aria-label="Next page"
          className={cn(item, page >= pageCount && disabled)}
          aria-disabled={page >= pageCount}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </nav>
  )
}

/** Clamp a raw `?page=` search param into a valid 1-based page number. */
export function parsePage(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}
