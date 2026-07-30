import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LayoutGrid, List } from 'lucide-react'
import { and, asc, count, desc, eq, ilike, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  engines,
  members,
  projects,
  teams,
  views as viewsTable,
  workItems,
  WORK_ITEM_STATUSES,
  type ViewLayout,
  type WorkItemStatus,
} from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canManageWorkspaceConfig, isAdmin, visibleMemberIds } from '@/lib/auth/permissions'
import { listEngineOptions, listTeamOptions } from '@/lib/org/list'
import { ManageProjectsDialog } from '@/components/projects/manage-projects-dialog'
import { CreateWorkItemDialog } from '@/components/work-items/create-work-item-dialog'
import { BulkImportDialog } from '@/components/work-items/bulk-import-dialog'
import { ManageTemplatesDialog } from '@/components/work-items/manage-templates-dialog'
import { AssigneeFilter } from '@/components/work-items/assignee-filter'
import { OrgTagFilter } from '@/components/work-items/org-tag-filter'
import { StatusFilter } from '@/components/work-items/status-filter'
import { WorkSearchInput } from '@/components/work-items/work-search-input'
import { WorkItemsTable } from '@/components/work-items/work-items-table'
import { BoardView } from '@/components/work-items/board-view'
import { BoardColumnsProvider } from '@/components/work-items/board-columns-context'
import { BoardColumnsButton } from '@/components/work-items/board-columns-button'
import { SavedViewsBar } from '@/components/work-items/saved-views-bar'
import { EmptyState, PageShell } from '@/components/page-shell'
import { Pagination, parsePage } from '@/components/ui/pagination'
import { COMPLETED_STATUSES, OPEN_STATUSES, STATUS_META } from '@/lib/work-items/constants'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Work' }

const PAGE_SIZE = 50

// Column keys the table header can sort by; falls back to manual rank order when unset.
const SORT_KEYS = ['title', 'project', 'status', 'priority', 'assignee', 'activity'] as const
type SortKey = (typeof SORT_KEYS)[number]

interface FilterState {
  statuses: Set<WorkItemStatus>
  project?: string
  assignee?: string // 'unassigned' | memberId
  engine?: string
  orgTeam?: string
  layout?: ViewLayout
  sort?: SortKey
  dir?: 'asc' | 'desc'
  q?: string
}

function workHref(filter: FilterState, page: number) {
  const params = new URLSearchParams()
  if (filter.statuses.size > 0) params.set('status', [...filter.statuses].join(','))
  if (filter.project) params.set('project', filter.project)
  if (filter.assignee) params.set('assignee', filter.assignee)
  if (filter.engine) params.set('engine', filter.engine)
  if (filter.orgTeam) params.set('team', filter.orgTeam)
  if (filter.q) params.set('q', filter.q)
  if (filter.layout && filter.layout !== 'board') params.set('layout', filter.layout)
  if (filter.sort) {
    params.set('sort', filter.sort)
    params.set('dir', filter.dir === 'desc' ? 'desc' : 'asc')
  }
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
  searchParams: Promise<{
    status?: string
    page?: string
    project?: string
    assignee?: string
    engine?: string
    team?: string
    layout?: string
    sort?: string
    dir?: string
    q?: string
    item?: string
  }>
}) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const {
    status: rawStatus,
    page: rawPage,
    project: rawProject,
    assignee: rawAssignee,
    engine: rawEngine,
    team: rawTeam,
    layout: rawLayout,
    sort: rawSort,
    dir: rawDir,
    q: rawQ,
    item: rawItem,
  } = await searchParams

  // Legacy deep link: /work?item=<id> used to open a drawer over the board.
  // Items now have their own page, so send those links there.
  if (rawItem) redirect(`/work/${encodeURIComponent(rawItem)}`)

  const statuses = new Set(
    (rawStatus?.split(',') ?? []).filter((s): s is WorkItemStatus => WORK_ITEM_STATUSES.includes(s as WorkItemStatus)),
  )
  const layout: ViewLayout = rawLayout === 'list' ? 'list' : 'board'
  const page = parsePage(rawPage)
  const sort = SORT_KEYS.find((k) => k === rawSort)
  const dir: 'asc' | 'desc' = rawDir === 'desc' ? 'desc' : 'asc'
  const q = rawQ?.trim() || undefined

  const [projectList, fullRoster, savedViews, engineOptions, teamOptions] = await Promise.all([
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
    listEngineOptions(workspaceId),
    listTeamOptions(workspaceId),
  ])
  const project = projectList.find((p) => p.id === rawProject)?.id
  const engine = engineOptions.find((e) => e.id === rawEngine)?.id
  const orgTeam = teamOptions.find((f) => f.id === rawTeam)?.id

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
  const searchFilter = q ? or(ilike(workItems.title, `%${q}%`), ilike(workItems.key, `%${q}%`)) : undefined

  const where = and(
    eq(workItems.workspaceId, workspaceId),
    statuses.size > 0 ? inArray(workItems.status, [...statuses]) : undefined,
    project ? eq(workItems.projectId, project) : undefined,
    engine ? eq(workItems.engineId, engine) : undefined,
    orgTeam ? eq(workItems.teamId, orgTeam) : undefined,
    assigneeFilter,
    visibility,
    snoozeFilter,
    searchFilter,
  )

  const countsWhere = and(
    eq(workItems.workspaceId, workspaceId),
    project ? eq(workItems.projectId, project) : undefined,
    engine ? eq(workItems.engineId, engine) : undefined,
    orgTeam ? eq(workItems.teamId, orgTeam) : undefined,
    assigneeFilter,
    visibility,
    searchFilter,
  )

  const sortColumn: Record<SortKey, Parameters<typeof asc>[0]> = {
    title: workItems.title,
    project: projects.name,
    status: workItems.status,
    priority: workItems.priority,
    assignee: members.name,
    activity: sql`coalesce(${workItems.lastEventAt}, ${workItems.updatedAt})`,
  }
  // Manual drag order (rank) is the default; clicking a header switches to that column instead.
  const orderBy = sort
    ? [dir === 'desc' ? desc(sortColumn[sort]) : asc(sortColumn[sort]), asc(workItems.createdAt)]
    : [asc(workItems.rank), asc(workItems.createdAt)]

  const [rows, statusCounts] = await Promise.all([
    db
      .select({
        id: workItems.id,
        kind: workItems.kind,
        key: workItems.key,
        title: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        projectId: workItems.projectId,
        assigneeMemberId: workItems.assigneeMemberId,
        assigneeName: members.name,
        projectName: projects.name,
        engineName: engines.name,
        teamName: teams.name,
        externalUrl: workItems.externalUrl,
        lastEventAt: workItems.lastEventAt,
        updatedAt: workItems.updatedAt,
      })
      .from(workItems)
      .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
      .leftJoin(projects, eq(projects.id, workItems.projectId))
      .leftJoin(engines, eq(engines.id, workItems.engineId))
      .leftJoin(teams, eq(teams.id, workItems.teamId))
      .where(where)
      .orderBy(...orderBy)
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

  const filter: FilterState = {
    statuses,
    project,
    assignee,
    engine,
    orgTeam,
    layout,
    sort,
    dir: sort ? dir : undefined,
    q,
  }
  const isTriageView = statuses.size === 1 && statuses.has('triage')

  const currentFilterPayload = {
    statuses: statuses.size > 0 ? [...statuses] : undefined,
    projectId: project,
    assignee,
    engineId: engine,
    teamId: orgTeam,
  }
  const activeView =
    savedViews.find((v) => {
      const f = v.filters ?? {}
      const vStatuses = new Set(f.statuses ?? [])
      return (
        v.layout === layout &&
        sameSet(statuses, [...vStatuses]) &&
        f.projectId === project &&
        f.assignee === assignee &&
        f.engineId === engine &&
        f.teamId === orgTeam
      )
    }) ?? null

  const emptyTitle = q
    ? 'No matching work items'
    : statuses.size === 1
      ? `No ${STATUS_META[[...statuses][0]].label.toLowerCase()} items`
      : statuses.size > 0 || assignee
        ? 'No matching work items'
        : 'No work items yet'

  return (
    <PageShell
      title="Work"
      description="Status derived from the event stream — never hand-updated"
      fixed
      actions={
        <>
          <ManageTemplatesDialog />
          {canManageWorkspaceConfig(ctx) && <ManageProjectsDialog canDelete={isAdmin(ctx)} />}
          <BulkImportDialog defaultProjectId={project} />
          <CreateWorkItemDialog defaultProjectId={project} />
        </>
      }
    >
      <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 lg:px-6">
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
          <WorkSearchInput current={q} />

          {projectList.length > 1 && (
            <OrgTagFilter
              options={projectList}
              current={project}
              paramName="project"
              allLabel="All projects"
              className="w-40"
            />
          )}

          <div className="flex h-7 items-center divide-x overflow-hidden rounded-md border text-xs font-medium">
            <Link
              href={workHref({ ...filter, statuses: new Set() }, 1)}
              className={cn(
                'flex h-full items-center px-2.5 transition-colors',
                statuses.size === 0
                  ? 'bg-beacon/10 text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              All <span className="ml-1 tabular-nums opacity-70">{totalAll}</span>
            </Link>
            <Link
              href={workHref({ ...filter, statuses: new Set(OPEN_STATUSES) }, 1)}
              className={cn(
                'flex h-full items-center px-2.5 transition-colors',
                sameSet(statuses, OPEN_STATUSES)
                  ? 'bg-beacon/10 text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              Open
            </Link>
            <Link
              href={workHref({ ...filter, statuses: new Set(COMPLETED_STATUSES) }, 1)}
              className={cn(
                'flex h-full items-center px-2.5 transition-colors',
                sameSet(statuses, COMPLETED_STATUSES)
                  ? 'bg-beacon/10 text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              Completed
            </Link>
          </div>

          <StatusFilter current={statuses} counts={countByStatus} />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {roster.length > 0 && <AssigneeFilter roster={roster} current={assignee} />}
            {engineOptions.length > 0 && (
              <OrgTagFilter options={engineOptions} current={engine} paramName="engine" allLabel="Any engine" />
            )}
            {teamOptions.length > 0 && (
              <OrgTagFilter options={teamOptions} current={orgTeam} paramName="team" allLabel="Any team" />
            )}
            <div className="flex h-7 items-center divide-x overflow-hidden rounded-md border">
              <Link
                href={workHref({ ...filter, layout: 'board' }, 1)}
                title="Board view"
                className={cn(
                  'flex h-full w-7 items-center justify-center transition-colors',
                  layout === 'board'
                    ? 'bg-beacon/10 text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Link>
              <Link
                href={workHref({ ...filter, layout: 'list' }, 1)}
                title="List view"
                className={cn(
                  'flex h-full w-7 items-center justify-center transition-colors',
                  layout === 'list'
                    ? 'bg-beacon/10 text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <List className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>

        <BoardColumnsProvider>
          <div className="mb-3 flex shrink-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <SavedViewsBar
                views={savedViews}
                activeViewId={activeView?.id ?? null}
                currentFilters={currentFilterPayload}
                currentLayout={layout}
                currentMemberId={ctx.member.id}
                canDeleteAny={isAdmin(ctx)}
              />
            </div>
            {layout === 'board' && <BoardColumnsButton />}
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-1 rounded-lg border border-dashed">
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
            <div className="min-h-0 flex-1 overflow-hidden">
              <BoardView rows={rows} />
            </div>
          ) : (
            <WorkItemsTable
              rows={rows}
              roster={fullRoster}
              projects={projectList}
              isTriageView={isTriageView}
              sort={sort}
              dir={dir}
            />
          )}
        </BoardColumnsProvider>

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          hrefFor={(p) => workHref(filter, p)}
          className="mt-2 shrink-0"
        />
      </div>
    </PageShell>
  )
}
