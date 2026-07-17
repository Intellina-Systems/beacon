import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { signalSources, type SignalSource } from '@/lib/db/schema'
import { syncGitHubSource } from './github'
import { syncLinearSource } from './linear'
import type { SyncResult } from './types'

export type { SyncResult } from './types'

export async function syncSource(workspaceId: string, source: SignalSource): Promise<SyncResult> {
  switch (source.kind) {
    case 'github_repo':
      return syncGitHubSource(workspaceId, source)
    case 'linear_project':
    case 'linear_team':
    case 'linear_workspace':
      return syncLinearSource(workspaceId, source)
    default:
      throw new Error(`No connector for source kind: ${source.kind}`)
  }
}

export interface SyncSummary {
  sourcesSynced: number
  sourcesFailed: number
  events: number
  workItems: number
}

export async function syncAllSources(workspaceId?: string): Promise<SyncSummary> {
  const sources = await db
    .select()
    .from(signalSources)
    .where(
      workspaceId
        ? and(eq(signalSources.enabled, true), eq(signalSources.workspaceId, workspaceId))
        : eq(signalSources.enabled, true),
    )

  const summary: SyncSummary = { sourcesSynced: 0, sourcesFailed: 0, events: 0, workItems: 0 }

  for (const source of sources) {
    try {
      const result = await syncSource(source.workspaceId, source)
      summary.sourcesSynced++
      summary.events += result.events
      summary.workItems += result.workItems
    } catch (error) {
      summary.sourcesFailed++
      const message = error instanceof Error ? error.message : 'Sync failed'
      console.error(`[sync] ${source.kind} ${source.identifier} failed: ${message}`)
      await db
        .update(signalSources)
        .set({ lastSyncError: message, updatedAt: new Date() })
        .where(eq(signalSources.id, source.id))
    }
  }

  return summary
}
