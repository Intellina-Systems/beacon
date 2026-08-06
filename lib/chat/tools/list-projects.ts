import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { asc, count, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { projects, workItems } from '@/lib/db/schema'
import type { ChatToolContext } from './shared'

export function createListProjectsTool({ workspaceId }: ChatToolContext) {
  return tool({
    description: "List the workspace's projects, for resolving a project name to the id create_work_item needs.",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const rows = await db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          status: projects.status,
          itemCount: count(workItems.id),
        })
        .from(projects)
        .leftJoin(workItems, eq(workItems.projectId, projects.id))
        .where(eq(projects.workspaceId, workspaceId))
        .groupBy(projects.id)
        .orderBy(asc(projects.createdAt))
      return { projects: rows }
    },
  })
}
