import 'server-only'

import { asc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from './client'
import { projects } from './schema'

// Every work item belongs to a project; "General" is the fallback container.
export async function getDefaultProjectId(workspaceId: string): Promise<string> {
  const rows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(asc(projects.createdAt))
  const general = rows.find((p) => p.name === 'General')
  if (general) return general.id
  if (rows.length > 0) return rows[0].id
  const [created] = await db
    .insert(projects)
    .values({ id: nanoid(), workspaceId, name: 'General', description: 'Default project' })
    .returning({ id: projects.id })
  return created.id
}
