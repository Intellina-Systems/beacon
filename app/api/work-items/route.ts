import { and, asc, eq, inArray, isNull, lte, or, type SQL } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import {
  members,
  workItems,
  workItemTemplates,
  WORK_ITEM_KINDS,
  WORK_ITEM_STATUSES,
  type WorkItemTemplateDefaults,
} from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { visibleMemberIds } from '@/lib/auth/permissions'
import { rankAfter } from '@/lib/work-items/rank'
import { maxRank } from '@/lib/work-items/ordering'
import { insertWorkItem } from '@/lib/work-items/create'
import { linkWorkItemToGithubIssue } from '@/lib/github/issue-link'

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const statuses = params.get('status')?.split(',')
  const kind = params.get('kind')
  const parentId = params.get('parentId')
  const assignee = params.get('assignee') // 'unassigned' | a member id
  const engine = params.get('engine')
  const orgTeam = params.get('team')
  const includeSnoozed = params.get('includeSnoozed') === '1'

  const conditions: (SQL | undefined)[] = [eq(workItems.workspaceId, ctx.workspaceId)]
  const visible = await visibleMemberIds(ctx)
  if (visible) {
    conditions.push(
      or(
        inArray(workItems.assigneeMemberId, visible.length ? visible : ['__none__']),
        isNull(workItems.assigneeMemberId),
      ),
    )
  }
  if (statuses?.length) conditions.push(inArray(workItems.status, statuses as never))
  if (kind) conditions.push(eq(workItems.kind, kind as never))
  if (parentId) conditions.push(eq(workItems.parentId, parentId))
  if (assignee === 'unassigned') conditions.push(isNull(workItems.assigneeMemberId))
  else if (assignee) conditions.push(eq(workItems.assigneeMemberId, assignee))
  if (engine) conditions.push(eq(workItems.engineId, engine))
  if (orgTeam) conditions.push(eq(workItems.teamId, orgTeam))
  // Triage queue hides snoozed items until the snooze passes, mirroring
  // Linear: snoozing removes noise without losing the item.
  if (statuses?.includes('triage') && !includeSnoozed) {
    conditions.push(or(isNull(workItems.snoozedUntil), lte(workItems.snoozedUntil, new Date())))
  }

  const rows = await db
    .select({
      id: workItems.id,
      parentId: workItems.parentId,
      kind: workItems.kind,
      key: workItems.key,
      title: workItems.title,
      description: workItems.description,
      status: workItems.status,
      priority: workItems.priority,
      assigneeMemberId: workItems.assigneeMemberId,
      assigneeName: members.name,
      labels: workItems.labels,
      dueDate: workItems.dueDate,
      rank: workItems.rank,
      estimate: workItems.estimate,
      snoozedUntil: workItems.snoozedUntil,
      externalProvider: workItems.externalProvider,
      externalUrl: workItems.externalUrl,
      engineId: workItems.engineId,
      teamId: workItems.teamId,
      lastEventAt: workItems.lastEventAt,
      createdAt: workItems.createdAt,
      updatedAt: workItems.updatedAt,
    })
    .from(workItems)
    .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
    .where(and(...conditions))
    // Postgres ASC puts NULL ranks last; createdAt keeps unranked items stable
    .orderBy(asc(workItems.rank), asc(workItems.createdAt))
    .limit(500)

  return Response.json({ items: rows })
}

const createSchema = z.object({
  kind: z.enum(WORK_ITEM_KINDS).default('task'),
  projectId: z.string().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(50000).optional(),
  parentId: z.string().optional(),
  status: z.enum(WORK_ITEM_STATUSES).default('todo'),
  priority: z.number().int().min(0).max(4).default(0),
  assigneeMemberId: z.string().optional(),
  engineId: z.string().optional(),
  teamId: z.string().optional(),
  labels: z.array(z.string()).max(20).optional(),
  dueDate: z.coerce.date().optional(),
  estimate: z.number().min(0).max(1000).nullable().optional(),
  templateId: z.string().optional(),
  linkGithubIssue: z.boolean().optional().default(false),
})

// Fields the request body may leave to a template. Explicit body values always
// win over template defaults; the template never overrides a user's input.
function applyTemplateDefaults(
  body: z.infer<typeof createSchema>,
  defaults: WorkItemTemplateDefaults,
  raw: Record<string, unknown>,
): z.infer<typeof createSchema> {
  const provided = (field: string) => field in raw && raw[field] !== undefined
  return {
    ...body,
    kind: provided('kind') ? body.kind : (defaults.kind ?? body.kind),
    status: provided('status') ? body.status : (defaults.status ?? body.status),
    priority: provided('priority') ? body.priority : (defaults.priority ?? body.priority),
    description: body.description ?? defaults.description,
    labels: body.labels ?? defaults.labels,
    estimate: body.estimate ?? defaults.estimate ?? null,
    assigneeMemberId: body.assigneeMemberId ?? defaults.assigneeMemberId,
    projectId: body.projectId ?? defaults.projectId,
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid work item', issues: parsed.error.issues }, { status: 400 })
  }

  let data = parsed.data
  if (data.templateId) {
    const [template] = await db
      .select()
      .from(workItemTemplates)
      .where(and(eq(workItemTemplates.id, data.templateId), eq(workItemTemplates.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!template) return Response.json({ error: 'Template not found' }, { status: 404 })
    data = applyTemplateDefaults(data, template.defaults, raw ?? {})
  }

  // Validate assignee belongs to this workspace before we attach them
  let assignee: { id: string; name: string } | null = null
  if (data.assigneeMemberId) {
    const [row] = await db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(and(eq(members.id, data.assigneeMemberId), eq(members.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!row) return Response.json({ error: 'Assignee is not a member of this workspace' }, { status: 400 })
    assignee = row
  }

  const rank = rankAfter(await maxRank(ctx.workspaceId))
  const { templateId: _templateId, linkGithubIssue, ...itemFields } = data

  let item: typeof workItems.$inferSelect
  try {
    item = await insertWorkItem({
      workspaceId: ctx.workspaceId,
      creator: { id: ctx.member.id, name: ctx.member.name },
      assignee,
      fields: itemFields,
      rank,
    })
  } catch {
    return Response.json({ error: 'Could not allocate a unique issue key' }, { status: 500 })
  }

  let githubIssue: { ok: boolean; externalUrl?: string; reason?: string } | undefined
  if (linkGithubIssue) {
    githubIssue = await linkWorkItemToGithubIssue({
      workspaceId: ctx.workspaceId,
      workItem: { id: item.id, key: item.key, title: item.title, description: item.description, projectId: item.projectId },
      actorName: ctx.member.name,
      origin: new URL(req.url).origin,
    })
  }

  return Response.json({ item, ...(githubIssue ? { githubIssue } : {}) }, { status: 201 })
}
