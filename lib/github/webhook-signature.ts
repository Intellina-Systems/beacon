import crypto from 'crypto'

// Stored (encrypted) in signalSources.config for github_repo sources that
// have a registered webhook — see app/api/sources/route.ts (registration),
// app/api/sources/[id]/route.ts (deregistration), and
// app/api/webhooks/github/route.ts (verification).
export interface GithubWebhookConfig {
  webhookId: number
  webhookSecret: string
}

const SIGNATURE_PREFIX = 'sha256='

// GitHub signs webhook deliveries with HMAC-SHA256 over the raw request body
// (see https://docs.github.com/webhooks/using-webhooks/validating-webhook-deliveries).
// Comparison must be constant-time — a naive === leaks timing information an
// attacker can use to forge a valid signature byte by byte.
export function verifyGitHubSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) return false

  const expected = Buffer.from(
    SIGNATURE_PREFIX + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex'),
  )
  const actual = Buffer.from(signatureHeader)

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}
