import { type NextRequest } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { validateAuthorizeRequest } from '@/lib/oauth/authorize-request'
import { createAuthorizationCode } from '@/lib/oauth/codes'

// Handles the Authorize/Deny submission from app/oauth/authorize/page.tsx.
// Re-validates everything from scratch rather than trusting the hidden form
// fields the page rendered — the page's validation only decided what to
// *display*, this is what actually mints a credential.
export async function POST(req: NextRequest): Promise<Response> {
  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ error: 'invalid_request' }, { status: 400 })

  const params = new URLSearchParams()
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && key !== 'decision') params.set(key, value)
  }

  const validation = await validateAuthorizeRequest(params)
  if (!validation.ok) {
    // Not safe to redirect anywhere — redirect_uri itself may be what failed
    // validation, so this stays a Beacon-hosted error rather than trusting it.
    return Response.json({ error: validation.error }, { status: 400 })
  }
  const { client, redirectUri, codeChallenge, scope, state } = validation.request

  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Not signed in' }, { status: 401 })
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'No workspace access' }, { status: 403 })

  const redirectTarget = new URL(redirectUri)

  if (form.get('decision') !== 'allow') {
    redirectTarget.searchParams.set('error', 'access_denied')
    if (state) redirectTarget.searchParams.set('state', state)
    return Response.redirect(redirectTarget.toString())
  }

  const { code } = await createAuthorizationCode({
    clientId: client.id,
    memberId: ctx.member.id,
    workspaceId: ctx.workspaceId,
    redirectUri,
    codeChallenge,
    scope,
  })

  redirectTarget.searchParams.set('code', code)
  if (state) redirectTarget.searchParams.set('state', state)
  return Response.redirect(redirectTarget.toString())
}
