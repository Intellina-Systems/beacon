import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, count, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import { ExternalLink } from 'lucide-react'
import { db } from '@/lib/db/client'
import { members, projects, workItems, WORK_ITEM_STATUSES, type WorkItemStatus } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canViewAllTeams, isAdmin, visibleMemberIds } from '@/lib/auth/permissions'
import { ManageProjectsDialog } from '@/components/projects/manage-projects-dialog'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageShell } from '@/components/page-shell'
import { Pagination, parsePage } from '@/components/ui/pagination'
import { relativeTime } from '@/lib/utils/relative-time'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Work' }

const PAGE_SIZE = 50

const STATUS_META: Record<WorkItemStatus, { label: string; tone: string }> = {
  blocked: { label: 'Blocked', tone: 'bg-destructive' },
  in_progress: { label: 'In progress', tone: 'bg-chart-2' },
  in_review: { label: 'In review', tone: 'bg-chart-3' },
  todo: { label: 'Todo', tone: 'bg-muted-foreground/60' },
  backlog: { label: 'Backlog', tone: 'bg-muted-foreground/35' },
  done: { label: 'Done', tone: 'bg-success' },
  cancelled: { label: 'Cancelled', tone: 'bg-muted-foreground/35' },
}

const STATUS_TAB_ORDER: WorkItemStatus[] = [
  'blocked',
  'in_progress',
  'in_review',
  'todo',
  'backlog',
  'done',
  'cancelled',
]

const PRIORITY_LABEL: Record<number, string> = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' }

function workHref(status: string | undefined, page: number, project?: string) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (project) params.set('project', project)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/work?${qs}` : '/work'
}

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; project?: string }>
}) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const { status: rawStatus, page: rawPage, project: rawProject } = await searchParams
  const status = WORK_ITEM_STATUSES.includes(rawStatus as WorkItemStatus) ? (rawStatus as WorkItemStatus) : undefined
  const page = parsePage(rawPage)

  const projectList = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), ne(projects.status, 'archived')))
    .orderBy(projects.createdAt)
  const project = projectList.find((p) => p.id === rawProject)?.id

  const visible = await visibleMemberIds(ctx)
  const visibility = visible
    ? or(inArray(workItems.assigneeMemberId, visible.length ? visible : ['__none__']), isNull(workItems.assigneeMemberId))
    : undefined
  const where = and(
    eq(workItems.workspaceId, workspaceId),
    status ? eq(workItems.status, status) : undefined,
    project ? eq(workItems.projectId, project) : undefined,
    visibility,
  )

  const [rows, statusCounts] = await Promise.all([
    db
      .select({
        id: workItems.id,
        kind: workItems.kind,
        key: workItems.key,
        title: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        assigneeName: members.name,
        projectName: projects.name,
        externalUrl: workItems.externalUrl,
        lastEventAt: workItems.lastEventAt,
        updatedAt: workItems.updatedAt,
      })
      .from(workItems)
      .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
      .leftJoin(projects, eq(projects.id, workItems.projectId))
      .where(where)
      .orderBy(desc(workItems.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ status: workItems.status, count: count() })
      .from(workItems)
      .where(and(eq(workItems.workspaceId, workspaceId), project ? eq(workItems.projectId, project) : undefined, visibility))
      .groupBy(workItems.status),
  ])

  const countByStatus = new Map(statusCounts.map((r) => [r.status, r.count]))
  const totalAll = statusCounts.reduce((n, r) => n + r.count, 0)
  const total = status ? (countByStatus.get(status) ?? 0) : totalAll
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <PageShell
      title="Work"
      description="Status derived from the event stream — never hand-updated"
      actions={canViewAllTeams(ctx) ? <ManageProjectsDialog canDelete={isAdmin(ctx)} /> : undefined}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-5 lg:px-6">
        {projectList.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Link
              href={workHref(status, 1)}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
                !project
                  ? 'border-beacon/50 bg-beacon/10 text-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              All projects
            </Link>
            {projectList.map((p) => (
              <Link
                key={p.id}
                href={workHref(status, 1, p.id)}
                className={cn(
                  'rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
                  project === p.id
                    ? 'border-beacon/50 bg-beacon/10 text-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {p.name}
              </Link>
            ))}
          </div>
        )}
        <div className="mb-5 flex flex-wrap gap-1.5">
          <Link
            href={workHref(undefined, 1, project)}
            className={cn(
              'rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
              !status
                ? 'border-beacon/50 bg-beacon/10 text-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            All <span className="tabular-nums opacity-70">{totalAll}</span>
          </Link>
          {STATUS_TAB_ORDER.map((s) => {
            const c = countByStatus.get(s) ?? 0
            if (c === 0) return null
            return (
              <Link
                key={s}
                href={workHref(s, 1, project)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
                  status === s
                    ? 'border-beacon/50 bg-beacon/10 text-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_META[s].tone)} />
                {STATUS_META[s].label} <span className="tabular-nums opacity-70">{c}</span>
              </Link>
            )
          })}
        </div>

        {rows.length === 0 ? (
          <div className="flex rounded-lg border border-dashed">
            <EmptyState
              title={status ? `No ${STATUS_META[status].label.toLowerCase()} items` : 'No work items yet'}
              hint={
                <>
                  Add a Linear source in{' '}
                  <Link href="/integrations" className="underline underline-offset-2">
                    Integrations
                  </Link>{' '}
                  or create items via <code className="font-mono">POST /api/work-items</code>.
                </>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="micro-label px-4 py-2.5 text-left font-medium">Item</th>
                  <th className="micro-label hidden w-32 px-4 py-2.5 text-left font-medium lg:table-cell">Project</th>
                  <th className="micro-label w-32 px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="micro-label hidden w-24 px-4 py-2.5 text-left font-medium sm:table-cell">Priority</th>
                  <th className="micro-label hidden w-40 px-4 py-2.5 text-left font-medium md:table-cell">Assignee</th>
                  <th className="micro-label hidden w-32 px-4 py-2.5 text-right font-medium lg:table-cell">Activity</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-accent/40">
                    <td className="max-w-0 px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {item.key && (
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>
                        )}
                        <span className="truncate font-medium">{item.title}</span>
                        {item.kind !== 'task' && (
                          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase">
                            {item.kind}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-2.5 lg:table-cell">
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {item.projectName ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[item.status].tone)} />
                        {STATUS_META[item.status].label}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">
                      {item.priority != null && item.priority > 0 ? (
                        <span
                          className={cn(
                            'text-xs',
                            item.priority <= 2 ? 'font-medium text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {PRIORITY_LABEL[item.priority]}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="hidden truncate px-4 py-2.5 text-xs text-muted-foreground md:table-cell">
                      {item.assigneeName ?? <span className="text-muted-foreground/50">Unassigned</span>}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-muted-foreground lg:table-cell">
                      {relativeTime(item.lastEventAt ?? item.updatedAt)}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {item.externalUrl && (
                        <a
                          href={item.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Open in tracker"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          hrefFor={(p) => workHref(status, p, project)}
          className="mt-2"
        />
      </div>
    </PageShell>
  )
}
