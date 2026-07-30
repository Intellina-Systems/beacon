import { z } from 'zod'
import { asc, count, eq } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { projects, workItems } from '@/lib/db/schema'
import { getMcpAuth } from '../context'

const inputSchema = z.object({})

export function registerListProjectsTool(server: McpServer) {
  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: "List the workspace's projects, for resolving a project name to the id create_work_item needs.",
      inputSchema,
    },
    async (_input, ctx: ServerContext) => {
      const auth = getMcpAuth(ctx)
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
        .where(eq(projects.workspaceId, auth.workspaceId))
        .groupBy(projects.id)
        .orderBy(asc(projects.createdAt))

      return { content: [{ type: 'text' as const, text: JSON.stringify(rows) }] }
    },
  )
}
