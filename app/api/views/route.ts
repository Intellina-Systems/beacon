import { asc, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { views, VIEW_LAYOUTS, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { generateId } from '@/lib/utils/id'

// Views are workspace-shared — visible and usable by everyone, like a saved
// board in Linear/GitHub Projects. createdByMemberId just tracks ownership
// for the edit/delete permission check on the [id] route.
export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db.select().from(views).where(eq(views.workspaceId, ctx.workspaceId)).orderBy(asc(views.name))
  return Response.json({ views: rows })
}

const filtersSchema = z.object({
  statuses: z.array(z.enum(WORK_ITEM_STATUSES)).optional(),
  projectId: z.string().optional(),
  assignee: z.string().optional(),
  cycleId: z.string().optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(100),
  layout: z.enum(VIEW_LAYOUTS).default('list'),
  filters: filtersSchema.default({}),
})

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid view', issues: parsed.error.issues }, { status: 400 })

  try {
    const [view] = await db
      .insert(views)
      .values({
        id: generateId(),
        workspaceId: ctx.workspaceId,
        name: parsed.data.name,
        layout: parsed.data.layout,
        filters: parsed.data.filters,
        createdByMemberId: ctx.member.id,
      })
      .returning()
    return Response.json({ view }, { status: 201 })
  } catch (error) {
    const isUniqueViolation =
      typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
    if (isUniqueViolation) return Response.json({ error: 'A view with this name already exists' }, { status: 409 })
    throw error
  }
}
