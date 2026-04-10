import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { generateState } from 'arctic'
import { getSessionFromReq } from '@/lib/session/server'

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getSessionFromReq(req)

  if (!session?.user) {
    return Response.redirect(new URL('/?error=not_authenticated', req.url))
  }

  const clientId = process.env.LINEAR_CLIENT_ID
  const redirectUri = `${req.nextUrl.origin}/api/auth/linear/callback`

  if (!clientId) {
    return Response.redirect(new URL('/projects?error=linear_not_configured', req.url))
  }

  const state = generateState()
  const store = await cookies()

  store.set('linear_auth_state', state, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: 'lax',
  })
  store.set('linear_auth_user_id', session.user.id, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: 'lax',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read',
    state,
    prompt: 'consent',
  })

  return Response.redirect(`https://linear.app/oauth/authorize?${params.toString()}`)
}
