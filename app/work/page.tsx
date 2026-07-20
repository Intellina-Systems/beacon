import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LayoutGrid, List } from 'lucide-react'
import { and, asc, count, eq, inArray, isNull, lte, ne, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  members,
  projects,
  views as viewsTable,
  workItems,
  WORK_ITEM_STATUSES,
  type ViewLayout,
  type WorkItemStatus,
} from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canViewAllTeams, isAdmin, visibleMemberIds } from '@/lib/auth/permissions'
import { ManageProjectsDialog } from '@/components/projects/manage-projects-dialog'
import { CreateWorkItemDialog } from '@/components/work-items/create-work-item-dialog'
import { ManageTemplatesDialog } from '@/components/work-items/manage-templates-dialog'
import { AssigneeFilter } from '@/components/work-items/assignee-filter'
import { WorkItemsTable } from '@/components/work-items/work-items-table'
import { BoardView } from '@/components/work-items/board-view'
import { SavedViewsBar } from '@/components/work-items/saved-views-bar'
import { EmptyState, PageShell } from '@/components/page-shell'
import { Pagination, parsePage } from '@/components/ui/pagination'
import { COMPLETED_STATUSES, OPEN_STATUSES, STATUS_META, STATUS_TAB_ORDER } from '@/lib/work-items/constants'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Work' }

const PAGE_SIZE = 50

interface FilterState {
  statuses: Set<WorkItemStatus>
  project?: string
  assignee?: string // 'unassigned' | memberId
  layout?: ViewLayout
}

function workHref(filter: FilterState, page: number) {
  const params = new URLSearchParams()
  if (filter.statuses.size > 0) params.set('status', [...filter.statuses].join(','))
  if (filter.project) params.set('project', filter.project)
  if (filter.assignee) params.set('assignee', filter.assignee)
  if (filter.layout && filter.layout !== 'list') params.set('layout', filter.layout)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/work?${qs}` : '/work'
}

function sameSet(a: Set<WorkItemStatus>, b: WorkItemStatus[]) {
  return a.size === b.length && b.every((s) => a.has(s))
}

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; project?: string; assignee?: string; layout?: string }>
}) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const {
    status: rawStatus,
    page: rawPage,
    project: rawProject,
    assignee: rawAssignee,
    layout: rawLayout,
  } = await searchParams
  const statuses = new Set(
    (rawStatus?.split(',') ?? []).filter((s): s is WorkItemStatus => WORK_ITEM_STATUSES.includes(s as WorkItemStatus)),
  )
  const layout: ViewLayout = rawLayout === 'board' ? 'board' : 'list'
  const page = parsePage(rawPage)

  const [projectList, fullRoster, savedViews] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.workspaceId, workspaceId), ne(projects.status, 'archived')))
      .orderBy(projects.createdAt),
    db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.name),
    db.select().from(viewsTable).where(eq(viewsTable.workspaceId, workspaceId)).orderBy(asc(viewsTable.name)),
  ])
  const project = projectList.find((p) => p.id === rawProject)?.id

  const visible = await visibleMemberIds(ctx)
  // Assignee filter dropdown only ever offers people this viewer is allowed to see.
  const roster = visible ? fullRoster.filter((m) => visible.includes(m.id)) : fullRoster

  const assignee =
    rawAssignee === 'unassigned' || (rawAssignee && roster.some((m) => m.id === rawAssignee)) ? rawAssignee : undefined
  const assigneeFilter =
    assignee === 'unassigned'
      ? isNull(workItems.assigneeMemberId)
      : assignee
        ? eq(workItems.assigneeMemberId, assignee)
        : undefined

  const visibility = visible
    ? or(
        inArray(workItems.assigneeMemberId, visible.length ? visible : ['__none__']),
        isNull(workItems.assigneeMemberId),
      )
    : undefined
  // Triage hides snoozed items until the snooze passes, whenever triage is
  // part of the requested filter — mirrors the API list route.
  const snoozeFilter = statuses.has('triage')
    ? or(isNull(workItems.snoozedUntil), lte(workItems.snoozedUntil, new Date()))
    : undefined
  const where = and(
    eq(workItems.workspaceId, workspaceId),
    statuses.size > 0 ? inArray(workItems.status, [...statuses]) : undefined,
    project ? eq(workItems.projectId, project) : undefined,
    assigneeFilter,
    visibility,
    snoozeFilter,
  )

  const countsWhere = and(
    eq(workItems.workspaceId, workspaceId),
    project ? eq(workItems.projectId, project) : undefined,
    assigneeFilter,
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
      // Rank is the canonical manual order (drag-and-drop below writes it);
      // createdAt breaks ties for items that predate ranking.
      .orderBy(asc(workItems.rank), asc(workItems.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ status: workItems.status, count: count() })
      .from(workItems)
      .where(countsWhere)
      .groupBy(workItems.status),
  ])

  const countByStatus = new Map(statusCounts.map((r) => [r.status, r.count]))
  const totalAll = statusCounts.reduce((n, r) => n + r.count, 0)
  const total = statuses.size > 0 ? [...statuses].reduce((n, s) => n + (countByStatus.get(s) ?? 0), 0) : totalAll
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const filter: FilterState = { statuses, project, assignee, layout }
  const isTriageView = statuses.size === 1 && statuses.has('triage')

  const currentFilterPayload = {
    statuses: statuses.size > 0 ? [...statuses] : undefined,
    projectId: project,
    assignee,
  }
  const activeView =
    savedViews.find((v) => {
      const f = v.filters ?? {}
      const vStatuses = new Set(f.statuses ?? [])
      return (
        v.layout === layout && sameSet(statuses, [...vStatuses]) && f.projectId === project && f.assignee === assignee
      )
    }) ?? null

  const emptyTitle =
    statuses.size === 1
      ? `No ${STATUS_META[[...statuses][0]].label.toLowerCase()} items`
      : statuses.size > 0 || assignee
        ? 'No matching work items'
        : 'No work items yet'

  return (
    <PageShell
      title="Work"
      description="Status derived from the event stream — never hand-updated"
      actions={
        <>
          <ManageTemplatesDialog />
          {canViewAllTeams(ctx) && <ManageProjectsDialog canDelete={isAdmin(ctx)} />}
          <CreateWorkItemDialog defaultProjectId={project} />
        </>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-5 lg:px-6">
        {projectList.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Link
              href={workHref({ ...filter, project: undefined }, 1)}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
                !project
                  ? 'border-beacon/50 bg-beacon/10 text-foreground'
                  : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
              )}
            >
              All projects
            </Link>
            {projectList.map((p) => (
              <Link
                key={p.id}
                href={workHref({ ...filter, project: p.id }, 1)}
                className={cn(
                  'rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
                  project === p.id
                    ? 'border-beacon/50 bg-beacon/10 text-foreground'
                    : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
                )}
              >
                {p.name}
              </Link>
            ))}
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Link
            href={workHref({ ...filter, statuses: new Set() }, 1)}
            className={cn(
              'rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
              statuses.size === 0
                ? 'border-beacon/50 bg-beacon/10 text-foreground'
                : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
            )}
          >
            All <span className="tabular-nums opacity-70">{totalAll}</span>
          </Link>
          <Link
            href={workHref({ ...filter, statuses: new Set(OPEN_STATUSES) }, 1)}
            className={cn(
              'rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
              sameSet(statuses, OPEN_STATUSES)
                ? 'border-beacon/50 bg-beacon/10 text-foreground'
                : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
            )}
          >
            Open
          </Link>
          <Link
            href={workHref({ ...filter, statuses: new Set(COMPLETED_STATUSES) }, 1)}
            className={cn(
              'rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
              sameSet(statuses, COMPLETED_STATUSES)
                ? 'border-beacon/50 bg-beacon/10 text-foreground'
                : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
            )}
          >
            Completed
          </Link>
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          {STATUS_TAB_ORDER.map((s) => {
            const c = countByStatus.get(s) ?? 0
            if (c === 0 && !statuses.has(s)) return null
            const active = statuses.has(s)
            const nextStatuses = new Set(statuses)
            if (active) nextStatuses.delete(s)
            else nextStatuses.add(s)
            return (
              <Link
                key={s}
                href={workHref({ ...filter, statuses: nextStatuses }, 1)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-medium transition-colors',
                  active
                    ? 'border-beacon/50 bg-beacon/10 text-foreground'
                    : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
                )}
                title={active ? `Remove ${STATUS_META[s].label} from filter` : `Add ${STATUS_META[s].label} to filter`}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_META[s].tone)} />
                {STATUS_META[s].label} <span className="tabular-nums opacity-70">{c}</span>
              </Link>
            )
          })}
          {roster.length > 0 && (
            <>
              <span className="mx-1 h-4 w-px shrink-0 bg-border" />
              <AssigneeFilter roster={roster} current={assignee} />
            </>
          )}
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          <Link
            href={workHref({ ...filter, layout: 'list' }, 1)}
            title="List view"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
              layout === 'list'
                ? 'border-beacon/50 bg-beacon/10 text-foreground'
                : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
            )}
          >
            <List className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={workHref({ ...filter, layout: 'board' }, 1)}
            title="Board view"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
              layout === 'board'
                ? 'border-beacon/50 bg-beacon/10 text-foreground'
                : 'bg-card text-muted-foreground hover:border-beacon/30 hover:text-foreground',
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mb-3">
          <SavedViewsBar
            views={savedViews}
            activeViewId={activeView?.id ?? null}
            currentFilters={currentFilterPayload}
            currentLayout={layout}
            currentMemberId={ctx.member.id}
            canDeleteAny={isAdmin(ctx)}
          />
        </div>

        {rows.length === 0 ? (
          <div className="flex rounded-lg border border-dashed">
            <EmptyState
              title={emptyTitle}
              hint={
                <>
                  Create one with the <span className="font-medium">Create</span> button above, add a signal source in{' '}
                  <Link href="/integrations" className="underline underline-offset-2">
                    Integrations
                  </Link>
                  , or POST to <code className="font-mono">/api/work-items</code>.
                </>
              }
            />
          </div>
        ) : layout === 'board' ? (
          <BoardView rows={rows} roster={fullRoster} currentMemberId={ctx.member.id} />
        ) : (
          <WorkItemsTable rows={rows} roster={fullRoster} currentMemberId={ctx.member.id} isTriageView={isTriageView} />
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          hrefFor={(p) => workHref(filter, p)}
          className="mt-2"
        />
      </div>
    </PageShell>
  )
}
