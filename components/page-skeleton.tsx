import { PageShell } from '@/components/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

/** Skeleton for list/table pages: filter chips + a stacked rows surface, filling the viewport. */
export function ListPageSkeleton({ title, chips = 0 }: { title: string; chips?: number }) {
  return (
    <PageShell title={title} fixed>
      <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 lg:px-6">
        {chips > 0 && (
          <div className="mb-3 flex shrink-0 gap-1.5">
            {Array.from({ length: chips }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-20 rounded-full" />
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 space-y-px overflow-hidden rounded-lg border bg-card p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-24 sm:block" />
              <Skeleton className="hidden h-4 w-16 md:block" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}

/** Skeleton matching the Pulse dashboard layout. */
export function DashboardSkeleton() {
  return (
    <PageShell title="Pulse" fixed>
      <div className="flex flex-col gap-4 p-4 lg:h-full lg:p-5">
        <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[86px] rounded-lg" />
          ))}
        </div>
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12">
          <div className="flex min-h-0 flex-col gap-4 lg:col-span-8">
            <Skeleton className="h-44 shrink-0 rounded-lg" />
            <Skeleton className="min-h-40 flex-1 rounded-lg" />
          </div>
          <div className="flex min-h-0 flex-col gap-4 lg:col-span-4">
            <Skeleton className="h-32 shrink-0 rounded-lg" />
            <Skeleton className="h-36 shrink-0 rounded-lg" />
            <Skeleton className="min-h-28 flex-1 rounded-lg" />
          </div>
        </div>
      </div>
    </PageShell>
  )
}
