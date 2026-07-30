import Link from 'next/link'
import { Zap } from 'lucide-react'
import { getServerSession } from '@/lib/session/get-server-session'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { validateAuthorizeRequest } from '@/lib/oauth/authorize-request'
import { isRelativeUrl } from '@/lib/utils/is-relative-url'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Authorize connection' }

function AuthorizeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6 text-center shadow-sm">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-beacon">
          <Zap className="h-5 w-5 text-beacon-foreground" strokeWidth={2.5} />
        </span>
        {children}
      </div>
    </div>
  )
}

function paramsToSearchString(raw: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') params.set(key, value)
  }
  return params.toString()
}

// The consent screen an MCP client's browser lands on after Dynamic Client
// Registration. Gated by the exact same GitHub sign-in + invite-only check
// (lib/auth/sign-in-eligibility.ts) every other Beacon page uses — a
// stranger can't reach the "Authorize" button because they can't get past
// sign-in in the first place, the same as any other page in the app.
export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const search = paramsToSearchString(raw)
  const params = new URLSearchParams(search)

  const validation = await validateAuthorizeRequest(params)
  if (!validation.ok) {
    return (
      <AuthorizeShell>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Can&apos;t connect this app</h1>
          <p className="mt-1 text-sm text-muted-foreground">{validation.error}</p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Go to Beacon</Link>
        </Button>
      </AuthorizeShell>
    )
  }
  const { client, scope } = validation.request

  const session = await getServerSession()
  if (!session?.user) {
    const next = `/oauth/authorize?${search}`
    const signInUrl = `/api/auth/signin/github?next=${encodeURIComponent(isRelativeUrl(next) ? next : '/')}`
    return (
      <AuthorizeShell>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Sign in to connect {client.clientName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.clientName} wants to access your Beacon workspace. Sign in with the GitHub account on your invite to
            continue.
          </p>
        </div>
        <Button asChild className="w-full">
          <a href={signInUrl}>Sign in with GitHub</a>
        </Button>
      </AuthorizeShell>
    )
  }

  const ctx = await getWorkspaceContext()
  if (!ctx) {
    return (
      <AuthorizeShell>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">No workspace access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account isn&apos;t a member of any Beacon workspace, so there&apos;s nothing for {client.clientName} to
            connect to.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Go to Beacon</Link>
        </Button>
      </AuthorizeShell>
    )
  }

  const scopeLabels =
    scope === 'read write'
      ? ['Read work items, comments, events, and knowledge', 'Create and update work items, and post comments']
      : ['Read work items, comments, events, and knowledge']

  return (
    <AuthorizeShell>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Authorize {client.clientName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {client.clientName} wants to access <span className="font-medium text-foreground">{ctx.workspaceName}</span>{' '}
          as <span className="font-medium text-foreground">{ctx.member.name}</span>.
        </p>
      </div>
      <ul className="space-y-1.5 text-left text-sm text-muted-foreground">
        {scopeLabels.map((label) => (
          <li key={label} className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
            {label}
          </li>
        ))}
      </ul>
      <form action="/api/oauth/authorize" method="POST" className="space-y-2">
        {[...params.entries()].map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <Button type="submit" name="decision" value="allow" className="w-full">
          Authorize
        </Button>
        <Button type="submit" name="decision" value="deny" variant="outline" className="w-full">
          Deny
        </Button>
      </form>
    </AuthorizeShell>
  )
}
