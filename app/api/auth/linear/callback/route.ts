import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import { linearConnections } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { encrypt } from '@/lib/crypto'
import { getLinearViewer } from '@/lib/linear/client'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')
  const cookieStore = await cookies()

  if (error) {
    return Response.redirect(new URL(`/projects?error=linear_denied`, req.url))
  }

  const storedState = cookieStore.get('linear_auth_state')?.value ?? null
  const storedUserId = cookieStore.get('linear_auth_user_id')?.value ?? null

  if (!code || !state || state !== storedState || !storedUserId) {
    return Response.redirect(new URL('/projects?error=linear_invalid_state', req.url))
  }

  const clientId = process.env.LINEAR_CLIENT_ID
  const clientSecret = process.env.LINEAR_CLIENT_SECRET
  const redirectUri = `${req.nextUrl.origin}/api/auth/linear/callback`

  if (!clientId || !clientSecret) {
    return Response.redirect(new URL('/projects?error=linear_not_configured', req.url))
  }

  try {
    // Exchange code for access token
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
      return Response.redirect(new URL('/projects?error=linear_token_failed', req.url))
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string
      token_type: string
      expires_in?: number
      scope: string
      error?: string
    }

    if (!tokenData.access_token) {
      console.error('[Linear Callback] No access token in response')
      return Response.redirect(new URL('/projects?error=linear_token_failed', req.url))
    }

    // Get workspace info
    const viewer = await getLinearViewer(tokenData.access_token)

    // Encrypt and store token
    const encryptedToken = encrypt(tokenData.access_token)

    await db
      .insert(linearConnections)
      .values({
        id: nanoid(),
        userId: storedUserId,
        accessToken: encryptedToken,
        workspaceId: viewer.organization.id,
        workspaceName: viewer.organization.name,
        workspaceSlug: viewer.organization.urlKey,
        linearUserId: viewer.id,
      })
      .onConflictDoUpdate({
        target: linearConnections.userId,
        set: {
          accessToken: encryptedToken,
          workspaceId: viewer.organization.id,
          workspaceName: viewer.organization.name,
          workspaceSlug: viewer.organization.urlKey,
          linearUserId: viewer.id,
          updatedAt: new Date(),
        },
      })

    // Clean up cookies
    cookieStore.delete('linear_auth_state')
    cookieStore.delete('linear_auth_user_id')

    return Response.redirect(new URL('/projects?linear_connected=true', req.url))
  } catch (err) {
    console.error('[Linear Callback] Error:', err)
    return Response.redirect(new URL('/projects?error=linear_failed', req.url))
  }
}

export async function getLinearConnection(userId: string) {
  const rows = await db.select().from(linearConnections).where(eq(linearConnections.userId, userId)).limit(1)
  return rows[0] ?? null
}
