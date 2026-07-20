import 'server-only'

import { cookies } from 'next/headers'
import ms from 'ms'
import { ACTIVE_WORKSPACE_COOKIE_NAME } from '@/lib/session/constants'

const COOKIE_TTL_SECONDS = ms('1y') / 1000

// Callable from any Route Handler / Server Action — mutates the outgoing
// cookie jar directly, same pattern used for the session cookie.
export async function setActiveWorkspaceCookie(workspaceId: string): Promise<void> {
  const store = await cookies()
  store.set(ACTIVE_WORKSPACE_COOKIE_NAME, workspaceId, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_TTL_SECONDS,
  })
}

export async function getActiveWorkspaceCookie(): Promise<string | null> {
  const store = await cookies()
  return store.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value ?? null
}
