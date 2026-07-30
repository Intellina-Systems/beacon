import { jwtDecrypt, base64url, type JWTDecryptOptions } from 'jose'

export async function decryptJWE<T extends string | object = string | object>(
  cyphertext: string,
  secret: string | undefined = process.env.JWE_SECRET,
  // Default unchanged (zero tolerance) for every existing caller — session
  // cookies have no cross-region timing concern. A short tolerance matters for
  // short-TTL tokens (MCP access tokens, ~1hr) verified from wherever a
  // Vercel function happens to run, where a request landing in the last few
  // hundred ms before `exp` could otherwise fail on clock drift alone.
  options?: JWTDecryptOptions,
): Promise<T | undefined> {
  if (!secret) {
    throw new Error('Missing JWE secret')
  }

  if (typeof cyphertext !== 'string') return

  try {
    const { payload } = await jwtDecrypt(cyphertext, base64url.decode(secret), options)
    const decoded = payload as T
    if (typeof decoded === 'object' && decoded !== null) {
      delete (decoded as Record<string, unknown>).iat
      delete (decoded as Record<string, unknown>).exp
    }
    return decoded
  } catch {
    // Do nothing
  }
}
