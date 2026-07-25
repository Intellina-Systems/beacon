import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import { calendarAccounts } from '@/lib/db/schema'
import { encrypt } from '@/lib/crypto'
import { generateId } from '@/lib/utils/id'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { buildGoogleClient, googleRedirectUri } from '@/lib/google/oauth'
import { fetchGoogleEmail } from '@/lib/google/calendar'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')
  const store = await cookies()

  if (error) {
    return Response.redirect(new URL('/integrations?error=google_denied', req.url))
  }

  const storedState = store.get('google_auth_state')?.value ?? null
  const verifier = store.get('google_auth_verifier')?.value ?? null

  if (!code || !state || state !== storedState || !verifier) {
    return Response.redirect(new URL('/integrations?error=google_invalid_state', req.url))
  }

  const ctx = await getWorkspaceContext()
  if (!ctx) {
    return Response.redirect(new URL('/?error=not_authenticated', req.url))
  }

  const client = buildGoogleClient(googleRedirectUri(req.nextUrl.origin))
  if (!client) {
    return Response.redirect(new URL('/integrations?error=google_not_configured', req.url))
  }

  try {
    const tokens = await client.validateAuthorizationCode(code, verifier)
    const accessToken = tokens.accessToken()
    const refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : null
    const expiresAt = tokens.accessTokenExpiresAt()
    const email = await fetchGoogleEmail(accessToken)

    await db
      .insert(calendarAccounts)
      .values({
        id: generateId(16),
        workspaceId: ctx.workspaceId,
        memberId: ctx.member.id,
        provider: 'google',
        accessToken: encrypt(accessToken),
        refreshToken: refreshToken ? encrypt(refreshToken) : null,
        tokenExpiresAt: expiresAt,
        externalEmail: email,
      })
      .onConflictDoUpdate({
        target: calendarAccounts.memberId,
        set: {
          accessToken: encrypt(accessToken),
          // Keep the existing refresh token if Google didn't return a new one.
          ...(refreshToken ? { refreshToken: encrypt(refreshToken) } : {}),
          tokenExpiresAt: expiresAt,
          externalEmail: email,
          enabled: true,
          // Force a fresh full sync after (re)connect.
          syncToken: null,
          updatedAt: new Date(),
        },
      })

    store.delete('google_auth_state')
    store.delete('google_auth_verifier')

    return Response.redirect(new URL('/integrations?google_connected=true', req.url))
  } catch (err) {
    console.error('[Google Callback] Error:', err)
    return Response.redirect(new URL('/integrations?error=google_failed', req.url))
  }
}
