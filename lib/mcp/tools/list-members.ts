import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { getMcpAuth } from '../context'

const inputSchema = z.object({})

export function registerListMembersTool(server: McpServer) {
  server.registerTool(
    'list_members',
    {
      title: 'List members',
      description:
        "List the workspace roster, for resolving a person's name to the member id create_work_item/update_work_item/add_comment need. Roster names are visible to everyone, regardless of role.",
      inputSchema,
    },
    async (_input, ctx: ServerContext) => {
      const auth = getMcpAuth(ctx)
      const rows = await db
        .select({ id: members.id, name: members.name, title: members.title, accessRole: members.accessRole })
        .from(members)
        .where(eq(members.workspaceId, auth.workspaceId))
        .orderBy(asc(members.name))

      return { content: [{ type: 'text' as const, text: JSON.stringify(rows) }] }
    },
  )
}
