import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { apiKeys } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { createApiKey } from '@/lib/api-keys'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, ctx.workspaceId))
    .orderBy(desc(apiKeys.createdAt))

  return Response.json({ keys: rows })
}

const createSchema = z.object({ name: z.string().min(1).max(100) })

export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Name is required' }, { status: 400 })

  const { key, record } = await createApiKey(ctx.workspaceId, parsed.data.name)
  // The plaintext key is returned only on creation
  return Response.json(
    { key, id: record.id, name: record.name, keyPrefix: record.keyPrefix, createdAt: record.createdAt },
    { status: 201 },
  )
}
