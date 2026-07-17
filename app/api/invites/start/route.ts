import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'

// Entry point for a signed-out invitee: stash the invite token in a short-lived
// cookie (the OAuth callback claims it right after the session is created, so
// no solo workspace gets bootstrapped) and hand off to GitHub sign-in.
export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return Response.redirect(new URL('/', req.url))

  const store = await cookies()
  store.set('beacon_invite_token', token, {
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 60 * 10,
    sameSite: 'lax',
  })

  return Response.redirect(new URL(`/api/auth/signin/github?next=${encodeURIComponent(`/join/${token}`)}`, req.url))
}
