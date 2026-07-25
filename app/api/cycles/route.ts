import { and, desc, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { cycles, projects } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canManageWorkspaceConfig, forbidden } from '@/lib/auth/permissions'
import { createCycle } from '@/lib/cycles/lifecycle'

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) return Response.json({ error: 'projectId is required' }, { status: 400 })

  const rows = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.workspaceId, ctx.workspaceId), eq(cycles.projectId, projectId)))
    .orderBy(desc(cycles.number))

  return Response.json({ cycles: rows })
}

const createSchema = z
  .object({
    projectId: z.string().min(1),
    name: z.string().max(100).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    cooldownEndsAt: z.coerce.date().optional(),
  })
  .refine((data) => data.endsAt > data.startsAt, { message: 'endsAt must be after startsAt' })
  .refine((data) => !data.cooldownEndsAt || data.cooldownEndsAt > data.endsAt, {
    message: 'cooldownEndsAt must be after endsAt',
  })

// Manually starting the FIRST cycle for a project is the only ceremony —
// after that, the cron (rolloverDueCycles) keeps the chain going on its own.
export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageWorkspaceConfig(ctx)) return forbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid cycle', issues: parsed.error.issues }, { status: 400 })

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, parsed.data.projectId), eq(projects.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

  const cycle = await createCycle({
    workspaceId: ctx.workspaceId,
    projectId: parsed.data.projectId,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    cooldownEndsAt: parsed.data.cooldownEndsAt,
    name: parsed.data.name,
  })

  return Response.json({ cycle }, { status: 201 })
}
