import 'server-only'

import { Google } from 'arctic'

// Read-only calendar + basic identity. Read-only is deliberate for v1 — Beacon
// observes meetings, it doesn't create them yet (write scopes come with the
// create-meeting-from-Beacon feature later).
export const GOOGLE_SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.readonly']

export function googleRedirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`
}

// Returns null when the Google OAuth app isn't provisioned — every caller
// degrades gracefully to "not configured" instead of throwing, same as Linear.
export function buildGoogleClient(redirectUri: string): Google | null {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return new Google(clientId, clientSecret, redirectUri)
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}
