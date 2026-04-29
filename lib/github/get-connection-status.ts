import 'server-only'

import { db } from '@/lib/db/client'
import { accounts, users } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export async function getServerGitHubConnection(userId: string): Promise<{
  connected: boolean
  username: string | null
}> {
  const account = await db
    .select({ username: accounts.username })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
    .limit(1)

  if (account[0]) {
    return { connected: true, username: account[0].username }
  }

  const user = await db
    .select({ username: users.username })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.provider, 'github')))
    .limit(1)

  if (user[0]) {
    return { connected: true, username: user[0].username }
  }

  return { connected: false, username: null }
}
