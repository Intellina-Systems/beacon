import Link from 'next/link'
import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { ExternalLink } from 'lucide-react'
import { db } from '@/lib/db/client'
import { members, workItems, type WorkItemStatus } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { Badge } from '@/components/ui/badge'
import { relativeTime } from '@/lib/utils/relative-time'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const STATUS_ORDER: WorkItemStatus[] = ['blocked', 'in_progress', 'in_review', 'todo', 'backlog', 'done', 'cancelled']

const STATUS_META: Record<WorkItemStatus, { label: string; tone: string }> = {
  blocked: { label: 'Blocked', tone: 'bg-red-500' },
  in_progress: { label: 'In progress', tone: 'bg-blue-500' },
  in_review: { label: 'In review', tone: 'bg-purple-500' },
  todo: { label: 'Todo', tone: 'bg-slate-400' },
  backlog: { label: 'Backlog', tone: 'bg-slate-300' },
  done: { label: 'Done', tone: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', tone: 'bg-slate-300' },
}

const PRIORITY_LABEL: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' }

export default async function WorkPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/')

  const rows = await db
    .select({
      id: workItems.id,
      kind: workItems.kind,
      key: workItems.key,
      title: workItems.title,
      status: workItems.status,
      priority: workItems.priority,
      assigneeName: members.name,
      externalProvider: workItems.externalProvider,
      externalUrl: workItems.externalUrl,
      lastEventAt: workItems.lastEventAt,
      updatedAt: workItems.updatedAt,
    })
    .from(workItems)
    .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
    .where(eq(workItems.userId, session.user.id))
    .orderBy(desc(workItems.updatedAt))
    .limit(500)

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    items: rows.filter((row) => row.status === status),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Work</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {rows.length} work item{rows.length === 1 ? '' : 's'} — status is derived from the event stream.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 border rounded-md border-dashed">
          <p className="text-muted-foreground">No work items yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add a Linear source in{' '}
            <Link href="/integrations" className="underline">
              Integrations
            </Link>{' '}
            or create items via <code className="font-mono text-xs">POST /api/work-items</code>.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ status, items }) => (
            <section key={status}>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('h-2 w-2 rounded-full', STATUS_META[status].tone)} />
                <h2 className="text-sm font-semibold">{STATUS_META[status].label}</h2>
                <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
              </div>
              <div className="rounded-md border divide-y">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    {item.key && <span className="font-mono text-xs text-muted-foreground shrink-0">{item.key}</span>}
                    <span className="truncate flex-1">{item.title}</span>
                    {item.priority != null && item.priority > 0 && (
                      <Badge
                        variant={item.priority <= 2 ? 'destructive' : 'outline'}
                        className="px-1.5 py-0 text-[10px] shrink-0"
                      >
                        {PRIORITY_LABEL[item.priority]}
                      </Badge>
                    )}
                    {item.kind !== 'task' && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] shrink-0">
                        {item.kind}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                      {item.assigneeName ?? 'Unassigned'}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
                      {relativeTime(item.lastEventAt ?? item.updatedAt)}
                    </span>
                    {item.externalUrl && (
                      <a
                        href={item.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
