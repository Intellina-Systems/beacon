import 'server-only'

import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { linearConnections, settings, type LinearConnection } from '@/lib/db/schema'
import { decrypt } from '@/lib/crypto'
import { getLinearViewer } from '@/lib/linear/client'

type EnsureOptions = {
  requireConnection?: boolean
  validateToken?: boolean
}

const VALIDATION_TTL_MINUTES = 10
const LAST_VALIDATED_KEY = 'linear_last_validated_at'

export async function ensureLinearConnection(
  userId: string,
  options: EnsureOptions = {},
): Promise<LinearConnection | null> {
  const { requireConnection = true, validateToken = true } = options

  const [connection] = await db.select().from(linearConnections).where(eq(linearConnections.userId, userId)).limit(1)

  if (!connection) {
    if (requireConnection) {
      redirect('/api/auth/linear/signin')
    }
    return null
  }

  if (!validateToken) {
    return connection
  }

  const [lastValidatedSetting] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, LAST_VALIDATED_KEY)))
    .limit(1)

  const lastValidatedAt = lastValidatedSetting?.value ?? null
  if (lastValidatedAt) {
    const minutesSince = (Date.now() - new Date(lastValidatedAt).getTime()) / (1000 * 60)
    if (minutesSince < VALIDATION_TTL_MINUTES) {
      return connection
    }
  }

  try {
    const accessToken = decrypt(connection.accessToken)
    await getLinearViewer(accessToken)
    await db
      .insert(settings)
      .values({
        id: `${userId}:${LAST_VALIDATED_KEY}`,
        userId,
        key: LAST_VALIDATED_KEY,
        value: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [settings.userId, settings.key],
        set: {
          value: new Date().toISOString(),
          updatedAt: new Date(),
        },
      })
  } catch {
    redirect('/api/auth/linear/signin')
  }

  return connection
}
