import 'server-only'

import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  engineMembers,
  engines,
  engineTeams,
  functionMembers,
  functions,
  functionTeams,
  members,
  teams,
} from '@/lib/db/schema'

export interface OrgUnitRow {
  id: string
  name: string
  description: string | null
  ownerMemberId: string | null
  ownerName: string | null
  members: { id: string; name: string }[]
  teams: { id: string; name: string }[]
}

export async function listEngines(workspaceId: string): Promise<OrgUnitRow[]> {
  const [engineRows, memberRows, teamRows] = await Promise.all([
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
      .select({ engineId: engineMembers.engineId, memberId: engineMembers.memberId, name: members.name })
      .from(engineMembers)
      .innerJoin(engines, eq(engines.id, engineMembers.engineId))
      .innerJoin(members, eq(members.id, engineMembers.memberId))
      .where(eq(engines.workspaceId, workspaceId)),
    db
      .select({ engineId: engineTeams.engineId, teamId: engineTeams.teamId, name: teams.name })
      .from(engineTeams)
      .innerJoin(engines, eq(engines.id, engineTeams.engineId))
      .innerJoin(teams, eq(teams.id, engineTeams.teamId))
      .where(eq(engines.workspaceId, workspaceId)),
  ])

  return engineRows.map((engine) => ({
    ...engine,
    members: memberRows.filter((m) => m.engineId === engine.id).map((m) => ({ id: m.memberId, name: m.name })),
    teams: teamRows.filter((t) => t.engineId === engine.id).map((t) => ({ id: t.teamId, name: t.name })),
  }))
}

export async function listFunctions(workspaceId: string): Promise<OrgUnitRow[]> {
  const [functionRows, memberRows, teamRows] = await Promise.all([
    db
      .select({
        id: functions.id,
        name: functions.name,
        description: functions.description,
        ownerMemberId: functions.ownerMemberId,
        ownerName: members.name,
      })
      .from(functions)
      .leftJoin(members, eq(members.id, functions.ownerMemberId))
      .where(eq(functions.workspaceId, workspaceId))
      .orderBy(asc(functions.name)),
    db
      .select({ functionId: functionMembers.functionId, memberId: functionMembers.memberId, name: members.name })
      .from(functionMembers)
      .innerJoin(functions, eq(functions.id, functionMembers.functionId))
      .innerJoin(members, eq(members.id, functionMembers.memberId))
      .where(eq(functions.workspaceId, workspaceId)),
    db
      .select({ functionId: functionTeams.functionId, teamId: functionTeams.teamId, name: teams.name })
      .from(functionTeams)
      .innerJoin(functions, eq(functions.id, functionTeams.functionId))
      .innerJoin(teams, eq(teams.id, functionTeams.teamId))
      .where(eq(functions.workspaceId, workspaceId)),
  ])

  return functionRows.map((fn) => ({
    ...fn,
    members: memberRows.filter((m) => m.functionId === fn.id).map((m) => ({ id: m.memberId, name: m.name })),
    teams: teamRows.filter((t) => t.functionId === fn.id).map((t) => ({ id: t.teamId, name: t.name })),
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

export async function listFunctionOptions(workspaceId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: functions.id, name: functions.name })
    .from(functions)
    .where(eq(functions.workspaceId, workspaceId))
    .orderBy(asc(functions.name))
}
