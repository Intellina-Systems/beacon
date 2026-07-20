import { asc, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { workItemTemplates, WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { generateId } from '@/lib/utils/id'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await db
    .select()
    .from(workItemTemplates)
    .where(eq(workItemTemplates.workspaceId, ctx.workspaceId))
    .orderBy(asc(workItemTemplates.name))

  return Response.json({ templates })
}

const defaultsSchema = z.object({
  title: z.string().max(300).optional(),
  description: z.string().max(10000).optional(),
  kind: z.enum(WORK_ITEM_KINDS).optional(),
  status: z.enum(WORK_ITEM_STATUSES).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  labels: z.array(z.string()).max(20).optional(),
  estimate: z.number().min(0).max(1000).optional(),
  assigneeMemberId: z.string().optional(),
  projectId: z.string().optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  defaults: defaultsSchema,
})

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid template', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const [template] = await db
      .insert(workItemTemplates)
      .values({
        id: generateId(),
        workspaceId: ctx.workspaceId,
        name: parsed.data.name,
        description: parsed.data.description,
        defaults: parsed.data.defaults,
        createdByMemberId: ctx.member.id,
      })
      .returning()
    return Response.json({ template }, { status: 201 })
  } catch (error) {
    const isUniqueViolation =
      typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
    if (isUniqueViolation) {
      return Response.json({ error: 'A template with this name already exists' }, { status: 409 })
    }
    throw error
  }
}
