export interface VercelUser {
  uid?: string
  id?: string
  username: string
  email?: string
  name?: string
}

export async function fetchUser(accessToken: string): Promise<VercelUser | null> {
  const res = await fetch('https://api.vercel.com/v2/user', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) return null

  const data = (await res.json()) as { user: VercelUser }
  return data.user ?? null
}
