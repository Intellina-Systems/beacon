import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import { connections } from '@/lib/db/schema'
import { nanoid } from 'nanoid'
import { encrypt } from '@/lib/crypto'
import { getLinearViewer } from '@/lib/linear/client'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')
  const cookieStore = await cookies()

  if (error) {
    return Response.redirect(new URL(`/integrations?error=linear_denied`, req.url))
  }

  const storedState = cookieStore.get('linear_auth_state')?.value ?? null
  const storedUserId = cookieStore.get('linear_auth_user_id')?.value ?? null

  if (!code || !state || state !== storedState || !storedUserId) {
    return Response.redirect(new URL('/integrations?error=linear_invalid_state', req.url))
  }

  const clientId = process.env.LINEAR_CLIENT_ID
  const clientSecret = process.env.LINEAR_CLIENT_SECRET
  const redirectUri = `${req.nextUrl.origin}/api/auth/linear/callback`

  if (!clientId || !clientSecret) {
    return Response.redirect(new URL('/integrations?error=linear_not_configured', req.url))
  }

  try {
    const tokenResponse = await fetch('https://api.linear.app/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      console.error('[Linear Callback] Token exchange failed:', tokenResponse.status)
      return Response.redirect(new URL('/integrations?error=linear_token_failed', req.url))
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string }

    if (!tokenData.access_token) {
      console.error('[Linear Callback] No access token in response')
      return Response.redirect(new URL('/integrations?error=linear_token_failed', req.url))
    }

    const viewer = await getLinearViewer(tokenData.access_token)
    const encryptedToken = encrypt(tokenData.access_token)

    await db
      .insert(connections)
      .values({
        id: nanoid(),
        userId: storedUserId,
        provider: 'linear',
        accessToken: encryptedToken,
        externalUserId: viewer.id,
        workspaceId: viewer.organization.id,
        workspaceName: viewer.organization.name,
        config: { workspaceSlug: viewer.organization.urlKey },
      })
      .onConflictDoUpdate({
        target: [connections.userId, connections.provider],
        set: {
          accessToken: encryptedToken,
          externalUserId: viewer.id,
          workspaceId: viewer.organization.id,
          workspaceName: viewer.organization.name,
          config: { workspaceSlug: viewer.organization.urlKey },
          updatedAt: new Date(),
        },
      })

    cookieStore.delete('linear_auth_state')
    cookieStore.delete('linear_auth_user_id')

    return Response.redirect(new URL('/integrations?linear_connected=true', req.url))
  } catch (err) {
    console.error('[Linear Callback] Error:', err)
    return Response.redirect(new URL('/integrations?error=linear_failed', req.url))
  }
}
