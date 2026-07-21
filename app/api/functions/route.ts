import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { functions } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { listFunctions } from '@/lib/org/list'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  return Response.json({ functions: await listFunctions(ctx.workspaceId) })
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
  if (!parsed.success) return Response.json({ error: 'Invalid function', issues: parsed.error.issues }, { status: 400 })

  const [fn] = await db
    .insert(functions)
    .values({
      id: nanoid(),
      workspaceId: ctx.workspaceId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      ownerMemberId: parsed.data.ownerMemberId ?? null,
    })
    .onConflictDoNothing()
    .returning()

  if (!fn) return Response.json({ error: 'A function with that name already exists' }, { status: 409 })
  return Response.json({ function: fn }, { status: 201 })
}
