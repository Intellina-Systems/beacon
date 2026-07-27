import 'server-only'

import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { engineMembers, engines, members, teams } from '@/lib/db/schema'

export interface OrgUnitRow {
  id: string
  name: string
  description: string | null
  ownerMemberId: string | null
  ownerName: string | null
  members: { id: string; name: string; avatarUrl: string | null }[]
}

export async function listEngines(workspaceId: string): Promise<OrgUnitRow[]> {
  const [engineRows, memberRows] = await Promise.all([
    db
      .select({
        id: engines.id,
        name: engines.name,
        description: engines.description,
        ownerMemberId: engines.ownerMemberId,
        ownerName: members.name,
      })
      .from(engines)
      .leftJoin(members, eq(members.id, engines.ownerMemberId))
      .where(eq(engines.workspaceId, workspaceId))
      .orderBy(asc(engines.name)),
    db
      .select({
        engineId: engineMembers.engineId,
        memberId: engineMembers.memberId,
        name: members.name,
        avatarUrl: members.avatarUrl,
      })
      .from(engineMembers)
      .innerJoin(engines, eq(engines.id, engineMembers.engineId))
      .innerJoin(members, eq(members.id, engineMembers.memberId))
      .where(eq(engines.workspaceId, workspaceId)),
  ])

  return engineRows.map((engine) => ({
    ...engine,
    members: memberRows
      .filter((m) => m.engineId === engine.id)
      .map((m) => ({ id: m.memberId, name: m.name, avatarUrl: m.avatarUrl })),
  }))
}

// Lightweight option lists for tagging selects (work-item dialogs, knowledge form, filters).
export async function listEngineOptions(workspaceId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: engines.id, name: engines.name })
    .from(engines)
    .where(eq(engines.workspaceId, workspaceId))
    .orderBy(asc(engines.name))
}

export async function listTeamOptions(workspaceId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.workspaceId, workspaceId))
    .orderBy(asc(teams.name))
}
