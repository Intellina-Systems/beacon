import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { engines } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { listEngines } from '@/lib/org/list'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  return Response.json({ engines: await listEngines(ctx.workspaceId) })
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  ownerMemberId: z.string().optional(),
})

export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid engine', issues: parsed.error.issues }, { status: 400 })

  const [engine] = await db
    .insert(engines)
    .values({
      id: nanoid(),
      workspaceId: ctx.workspaceId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      ownerMemberId: parsed.data.ownerMemberId ?? null,
    })
    .onConflictDoNothing()
    .returning()

  if (!engine) return Response.json({ error: 'An engine with that name already exists' }, { status: 409 })
  return Response.json({ engine }, { status: 201 })
}
