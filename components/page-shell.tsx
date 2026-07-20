import { cn } from '@/lib/utils'

interface PageShellProps {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  /** When true the content area never scrolls — panels inside manage their own overflow (desktop dashboards). */
  fixed?: boolean
}

/**
 * Standard page frame: 56px header row with title + actions, full-width
 * content region below. The shell owns the scroll container so dashboard
 * pages can lock to the viewport while list pages scroll normally.
 */
export function PageShell({ title, description, actions, children, fixed = false }: PageShellProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 lg:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>
          {description && <p className="hidden truncate text-[13px] text-muted-foreground md:block">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn('min-h-0 flex-1', fixed ? 'overflow-y-auto lg:overflow-hidden' : 'overflow-y-auto')}>
        {children}
      </div>
    </div>
  )
}

/** Uppercase mono section header used across panels. */
export function PanelLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('micro-label', className)}>{children}</p>
}

/** Bordered surface used for dashboard panels and data tables. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('flex min-h-0 flex-col rounded-lg border bg-card shadow-xs', className)}>{children}</section>
  )
}

export function PanelHeader({
  label,
  meta,
  className,
}: {
  label: React.ReactNode
  meta?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5', className)}>
      <PanelLabel>{label}</PanelLabel>
      {meta && <div className="flex items-center gap-2 text-xs text-muted-foreground">{meta}</div>}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-muted-foreground/80">{hint}</p>}
    </div>
  )
}
