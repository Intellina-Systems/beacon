import 'server-only'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { calendarAccounts, type CalendarAccount } from '@/lib/db/schema'
import { decrypt, encrypt } from '@/lib/crypto'
import { buildGoogleClient } from './oauth'

// Refresh a little before actual expiry so a token doesn't die mid-request.
const EXPIRY_BUFFER_MS = 60_000

// Return a live access token for the account, refreshing and persisting a new
// one if the stored token is expired (or about to be). Google access tokens
// last ~1h, so this runs on most syncs. The refresh token is re-persisted only
// when Google returns a new one — it usually keeps the same one.
export async function getValidAccessToken(account: CalendarAccount): Promise<string> {
  const stillValid = account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() > EXPIRY_BUFFER_MS
  if (stillValid) return decrypt(account.accessToken)

  // No refresh token (rare — only if the first consent didn't grant offline
  // access): fall back to the stored token and let the API call surface a 401.
  if (!account.refreshToken) return decrypt(account.accessToken)

  const client = buildGoogleClient('') // redirect URI is unused for refresh
  if (!client) throw new Error('Google OAuth not configured')

  const tokens = await client.refreshAccessToken(decrypt(account.refreshToken))
  const accessToken = tokens.accessToken()

  await db
    .update(calendarAccounts)
    .set({
      accessToken: encrypt(accessToken),
      tokenExpiresAt: tokens.accessTokenExpiresAt(),
      ...(tokens.hasRefreshToken() ? { refreshToken: encrypt(tokens.refreshToken()) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(calendarAccounts.id, account.id))

  return accessToken
}
