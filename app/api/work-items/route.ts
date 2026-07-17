import { and, asc, desc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { members, workItems, WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { visibleMemberIds } from '@/lib/auth/permissions'
import { generateId } from '@/lib/utils/id'
import { getDefaultProjectId } from '@/lib/db/projects'
import { ingestEvents } from '@/lib/events/ingest'

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const statuses = params.get('status')?.split(',')
  const kind = params.get('kind')
  const parentId = params.get('parentId')

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
      externalProvider: workItems.externalProvider,
      externalUrl: workItems.externalUrl,
      lastEventAt: workItems.lastEventAt,
      updatedAt: workItems.updatedAt,
    })
    .from(workItems)
    .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
    .where(and(...conditions))
    .orderBy(asc(workItems.status), desc(workItems.updatedAt))
    .limit(500)

  return Response.json({ items: rows })
}

const createSchema = z.object({
  kind: z.enum(WORK_ITEM_KINDS).default('task'),
  projectId: z.string().optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(10000).optional(),
  key: z.string().max(30).optional(),
  parentId: z.string().optional(),
  status: z.enum(WORK_ITEM_STATUSES).default('todo'),
  priority: z.number().int().min(0).max(4).default(0),
  assigneeMemberId: z.string().optional(),
  labels: z.array(z.string()).optional(),
  dueDate: z.coerce.date().optional(),
})

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid work item', issues: parsed.error.issues }, { status: 400 })
  }

  const [item] = await db
    .insert(workItems)
    .values({
      id: generateId(),
      workspaceId: ctx.workspaceId,
      ...parsed.data,
      projectId: parsed.data.projectId ?? (await getDefaultProjectId(ctx.workspaceId)),
      statusChangedAt: new Date(),
    })
    .returning()

  await ingestEvents(
    [
      {
        type: 'task.created',
        source: 'manual',
        summary: `${item.key ?? item.title} created`,
        task: item.id,
        externalId: `workitem:${item.id}:created`,
      },
    ],
    { workspaceId: ctx.workspaceId },
  )

  return Response.json({ item }, { status: 201 })
}
