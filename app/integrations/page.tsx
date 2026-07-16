import { redirect } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { apiKeys, connections, signalSources } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getServerGitHubConnection } from '@/lib/github/get-connection-status'
import { ConnectionsCard } from '@/components/integrations/connections-card'
import { SourcesCard } from '@/components/integrations/sources-card'
import { ApiKeysCard } from '@/components/integrations/api-keys-card'
import { AgentSetupCard } from '@/components/integrations/agent-setup-card'
import { PageShell } from '@/components/page-shell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Integrations' }

export default async function IntegrationsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/')
  const userId = session.user.id

  const [github, linearRows, sources, keys] = await Promise.all([
    getServerGitHubConnection(userId),
    db
      .select({ workspaceName: connections.workspaceName })
      .from(connections)
      .where(and(eq(connections.userId, userId), eq(connections.provider, 'linear')))
      .limit(1),
    db.select().from(signalSources).where(eq(signalSources.userId, userId)).orderBy(desc(signalSources.createdAt)),
    db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt)),
  ])

  const linear = linearRows[0] ?? null

  return (
    <PageShell
      title="Integrations"
      description="Every tool is just a signal source — connect them and Beacon does the rest"
    >
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 lg:px-6">
        <ConnectionsCard
          githubConnected={github.connected}
          githubUsername={github.username}
          linearWorkspace={linear?.workspaceName ?? null}
        />

        <SourcesCard
          sources={sources.map((source) => ({
            id: source.id,
            kind: source.kind,
            identifier: source.identifier,
            displayName: source.displayName,
            enabled: source.enabled,
            lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
            lastSyncError: source.lastSyncError,
          }))}
          githubConnected={github.connected}
          linearConnected={!!linear}
        />

        <ApiKeysCard
          keys={keys.map((key) => ({
            id: key.id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
            revokedAt: key.revokedAt?.toISOString() ?? null,
            createdAt: key.createdAt.toISOString(),
          }))}
        />

        <AgentSetupCard />
      </div>
    </PageShell>
  )
}
