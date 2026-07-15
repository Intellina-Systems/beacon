import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { apiKeys } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { createApiKey } from '@/lib/api-keys'

export async function GET(): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

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
    .where(eq(apiKeys.userId, session.user.id))
    .orderBy(desc(apiKeys.createdAt))

  return Response.json({ keys: rows })
}

const createSchema = z.object({ name: z.string().min(1).max(100) })

export async function POST(req: Request): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Name is required' }, { status: 400 })

  const { key, record } = await createApiKey(session.user.id, parsed.data.name)
  // The plaintext key is returned only on creation
  return Response.json(
    { key, id: record.id, name: record.name, keyPrefix: record.keyPrefix, createdAt: record.createdAt },
    { status: 201 },
  )
}
