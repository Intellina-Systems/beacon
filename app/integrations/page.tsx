import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { apiKeys, members, projects, signalSources } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { isAdmin } from '@/lib/auth/permissions'
import { getServerGitHubConnection } from '@/lib/github/get-connection-status'
import { getUnmatchedActors } from '@/lib/events/queries'
import { suggestMemberMatch } from '@/lib/members/suggest-match'
import { ConnectionsCard } from '@/components/integrations/connections-card'
import { SourcesCard } from '@/components/integrations/sources-card'
import { ApiKeysCard } from '@/components/integrations/api-keys-card'
import { AgentSetupCard } from '@/components/integrations/agent-setup-card'
import { McpConnectorCard } from '@/components/integrations/mcp-connector-card'
import { McpGrantsAdminTable } from '@/components/integrations/mcp-grants-admin-table'
import { UnmatchedIdentitiesTable } from '@/components/integrations/unmatched-identities-table'
import { PageShell } from '@/components/page-shell'
import { listGrantsForWorkspace } from '@/lib/oauth/grants'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Integrations' }

export default async function IntegrationsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/')
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  if (!isAdmin(ctx)) redirect('/timeline')
  const workspaceId = ctx.workspaceId

  const [github, sources, projectList, keys, mcpGrants, roster, unmatchedActors] = await Promise.all([
    getServerGitHubConnection(session.user.id),
    db
      .select()
      .from(signalSources)
      .where(eq(signalSources.workspaceId, workspaceId))
      .orderBy(desc(signalSources.createdAt)),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(projects.createdAt),
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
      .where(eq(apiKeys.workspaceId, workspaceId))
      .orderBy(desc(apiKeys.createdAt)),
    listGrantsForWorkspace(workspaceId),
    db
      .select({ id: members.id, name: members.name, githubUsername: members.githubUsername, aliases: members.aliases })
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.name),
    getUnmatchedActors(workspaceId),
  ])

  const unmatchedRows = unmatchedActors.map((actor) => ({
    actorLabel: actor.actorLabel,
    eventCount: actor.eventCount,
    lastSeenAt: actor.lastSeenAt.toISOString(),
    suggestedMemberId: suggestMemberMatch(actor.actorLabel, roster)?.member.id ?? null,
  }))

  return (
    <PageShell
      title="Integrations"
      description="Every tool is just a signal source — connect them and Beacon does the rest"
      fixed
    >
      <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 lg:px-6">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
          <ConnectionsCard githubConnected={github.connected} githubUsername={github.username} />

          <SourcesCard
            sources={sources.map((source) => ({
              id: source.id,
              kind: source.kind,
              identifier: source.identifier,
              displayName: source.displayName,
              enabled: source.enabled,
              lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
              lastSyncError: source.lastSyncError,
              projectId: source.projectId,
            }))}
            projects={projectList}
            githubConnected={github.connected}
          />

          <UnmatchedIdentitiesTable rows={unmatchedRows} members={roster.map((m) => ({ id: m.id, name: m.name }))} />

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

          <McpConnectorCard />

          <McpGrantsAdminTable
            grants={mcpGrants.map((g) => ({
              id: g.id,
              clientName: g.clientName,
              memberName: g.memberName,
              scope: g.scope,
              lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
              createdAt: g.createdAt.toISOString(),
            }))}
          />

          <AgentSetupCard />
        </div>
      </div>
    </PageShell>
  )
}
