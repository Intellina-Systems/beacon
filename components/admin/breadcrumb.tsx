import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface Crumb {
  label: string
  href?: string
}

// Rendered as PageShell's `title` — PageShell already wraps it in an <h1>,
// so this stays inline-level rather than introducing a nested heading.
export function AdminBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />}
            {crumb.href && !isLast ? (
              <Link href={crumb.href} className="text-muted-foreground transition-colors hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? '' : 'text-muted-foreground'}>{crumb.label}</span>
            )}
          </span>
        )
      })}
    </span>
  )
}
