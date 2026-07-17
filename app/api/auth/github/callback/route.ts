import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db/client'
import { users, accounts, members, workspaces } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { createGitHubSession, saveSession } from '@/lib/session/create-github'
import { claimInvite } from '@/lib/invites'
import { encrypt } from '@/lib/crypto'

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookieStore = await cookies()

  const authMode = cookieStore.get(`github_auth_mode`)?.value ?? null
  const isSignInFlow = authMode === 'signin'

  const storedState = cookieStore.get(authMode ? `github_auth_state` : `github_oauth_state`)?.value ?? null
  const storedRedirectTo =
    cookieStore.get(authMode ? `github_auth_redirect_to` : `github_oauth_redirect_to`)?.value ?? null
  const storedUserId = cookieStore.get(`github_oauth_user_id`)?.value ?? null

  if (isSignInFlow) {
    if (code === null || state === null || storedState !== state || storedRedirectTo === null) {
      return new Response('Invalid OAuth state', { status: 400 })
    }
  } else {
    if (
      code === null ||
      state === null ||
      storedState !== state ||
      storedRedirectTo === null ||
      storedUserId === null
    ) {
      return new Response('Invalid OAuth state', { status: 400 })
    }
  }

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response('GitHub OAuth not configured', { status: 500 })
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })

    if (!tokenResponse.ok) {
      return new Response('Failed to exchange code for token', { status: 400 })
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string
      scope: string
      token_type: string
      error?: string
      error_description?: string
    }

    if (!tokenData.access_token) {
      return new Response(
        `Failed to authenticate with GitHub: ${tokenData.error_description || tokenData.error || 'Unknown error'}`,
        { status: 400 },
      )
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github.v3+json' },
    })
    const githubUser = (await userResponse.json()) as { login: string; id: number }

    if (isSignInFlow) {
      const session = await createGitHubSession(tokenData.access_token, tokenData.scope)
      if (!session) {
        return new Response('Failed to create session', { status: 500 })
      }

      // Invitee flow: claim the stashed invite before anything can bootstrap a
      // solo workspace for this brand-new user.
      let redirectTo = storedRedirectTo
      const inviteToken = cookieStore.get('beacon_invite_token')?.value
      if (inviteToken) {
        const claim = await claimInvite(inviteToken, session.user.id)
        if (claim.ok) redirectTo = '/'
        cookieStore.delete('beacon_invite_token')
      }

      const response = new Response(null, { status: 302, headers: { Location: redirectTo } })
      await saveSession(response, session)
      cookieStore.delete(`github_auth_state`)
      cookieStore.delete(`github_auth_redirect_to`)
      cookieStore.delete(`github_auth_mode`)
      return response
    } else {
      // CONNECT FLOW: add GitHub to an existing user account
      const encryptedToken = encrypt(tokenData.access_token)

      const existingAccount = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.provider, 'github'), eq(accounts.externalUserId, `${githubUser.id}`)))
        .limit(1)

      if (existingAccount.length > 0) {
        const connectedUserId = existingAccount[0].userId

        if (connectedUserId !== storedUserId) {
          // Merge: move the old login's workspace ownership and memberships to
          // the new user; workspace-scoped data stays where it is.
          await db
            .update(workspaces)
            .set({ createdByUserId: storedUserId! })
            .where(eq(workspaces.createdByUserId, connectedUserId))
          await db.update(members).set({ authUserId: storedUserId! }).where(eq(members.authUserId, connectedUserId))
          await db.update(accounts).set({ userId: storedUserId! }).where(eq(accounts.userId, connectedUserId))
          await db.delete(users).where(eq(users.id, connectedUserId))
        }

        await db
          .update(accounts)
          .set({
            accessToken: encryptedToken,
            scope: tokenData.scope,
            username: githubUser.login,
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, existingAccount[0].id))
      } else {
        await db.insert(accounts).values({
          id: nanoid(),
          userId: storedUserId!,
          provider: 'github',
          externalUserId: `${githubUser.id}`,
          accessToken: encryptedToken,
          scope: tokenData.scope,
          username: githubUser.login,
        })
      }

      if (authMode) {
        cookieStore.delete(`github_auth_state`)
        cookieStore.delete(`github_auth_redirect_to`)
        cookieStore.delete(`github_auth_mode`)
      } else {
        cookieStore.delete(`github_oauth_state`)
        cookieStore.delete(`github_oauth_redirect_to`)
      }
      cookieStore.delete(`github_oauth_user_id`)

      return Response.redirect(new URL(storedRedirectTo, req.nextUrl.origin))
    }
  } catch (error) {
    console.error('[GitHub Callback] OAuth error:', error)
    return new Response('Failed to complete GitHub authentication', { status: 500 })
  }
}
