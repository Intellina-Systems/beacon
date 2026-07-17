import 'server-only'

import crypto from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'
import { db } from '@/lib/db/client'
import { apiKeys, type ApiKey } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'

const KEY_PREFIX = 'bcn_'
const generateSecret = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 40)

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

// Returns the plaintext key exactly once; only the hash is stored.
export async function createApiKey(workspaceId: string, name: string): Promise<{ key: string; record: ApiKey }> {
  const key = `${KEY_PREFIX}${generateSecret()}`
  const [record] = await db
    .insert(apiKeys)
    .values({
      id: generateId(),
      workspaceId,
      name,
      keyHash: hashKey(key),
      keyPrefix: key.slice(0, 10),
    })
    .returning()
  return { key, record }
}

export async function verifyApiKey(key: string): Promise<{ workspaceId: string; keyId: string } | null> {
  if (!key.startsWith(KEY_PREFIX)) return null
  const rows = await db
    .select({ id: apiKeys.id, workspaceId: apiKeys.workspaceId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashKey(key)), isNull(apiKeys.revokedAt)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .then(
      () => {},
      () => {},
    )
  return { workspaceId: row.workspaceId, keyId: row.id }
}
