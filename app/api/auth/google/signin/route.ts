import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { generateCodeVerifier, generateState } from 'arctic'
import { getSessionFromReq } from '@/lib/session/server'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { GOOGLE_SCOPES, buildGoogleClient, googleRedirectUri } from '@/lib/google/oauth'

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSessionFromReq(req)
  if (!session?.user) {
    return Response.redirect(new URL('/?error=not_authenticated', req.url))
  }

  const ctx = await getWorkspaceContext()
  if (!ctx) {
    return Response.redirect(new URL('/?error=not_authenticated', req.url))
  }

  const client = buildGoogleClient(googleRedirectUri(req.nextUrl.origin))
  if (!client) {
    return Response.redirect(new URL('/integrations?error=google_not_configured', req.url))
  }

  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const url = client.createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES)
  // Ask for a refresh token (offline) and force the consent screen so Google
  // actually returns one, even on reconnect.
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')

  const store = await cookies()
  const cookieOpts = {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: 'lax' as const,
  }
  store.set('google_auth_state', state, cookieOpts)
  store.set('google_auth_verifier', codeVerifier, cookieOpts)

  return Response.redirect(url)
}
