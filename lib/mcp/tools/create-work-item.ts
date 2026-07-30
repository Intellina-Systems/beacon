import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { members, WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { rankAfter } from '@/lib/work-items/rank'
import { maxRank } from '@/lib/work-items/ordering'
import { insertWorkItem } from '@/lib/work-items/create'
import { requireMemberContext } from '../context'

const inputSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(50000).optional(),
  kind: z.enum(WORK_ITEM_KINDS).default('task'),
  status: z.enum(WORK_ITEM_STATUSES).default('todo'),
  priority: z.number().int().min(0).max(4).default(0),
  assigneeMemberId: z.string().optional().describe('A member id from list_members — leave unset to create unassigned'),
  projectId: z
    .string()
    .optional()
    .describe('A project id from list_projects — defaults to the workspace default project'),
})

// Errors here are surfaced to the model as a tool result, not a 500 — the
// same convention lib/work-items/update.ts and lib/work-items/relations.ts
// use for the HTTP routes, applied to MCP's isError result shape instead.
function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

export function registerCreateWorkItemTool(server: McpServer) {
  server.registerTool(
    'create_work_item',
    {
      title: 'Create work item',
      description: 'Create a new task, feature, or epic in Beacon. Requires a connected member (not a bare API key).',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      let workspaceCtx
      try {
        workspaceCtx = await requireMemberContext(ctx)
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Not authorized')
      }

      let assignee: { id: string; name: string } | null = null
      if (input.assigneeMemberId) {
        const [row] = await db
          .select({ id: members.id, name: members.name })
          .from(members)
          .where(and(eq(members.id, input.assigneeMemberId), eq(members.workspaceId, workspaceCtx.workspaceId)))
          .limit(1)
        if (!row) return toolError('Assignee is not a member of this workspace')
        assignee = row
      }

      const rank = rankAfter(await maxRank(workspaceCtx.workspaceId))

      const item = await insertWorkItem({
        workspaceId: workspaceCtx.workspaceId,
        creator: { id: workspaceCtx.member.id, name: workspaceCtx.member.name },
        assignee,
        fields: {
          kind: input.kind,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          assigneeMemberId: assignee?.id,
          projectId: input.projectId,
        },
        rank,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ id: item.id, key: item.key, title: item.title, status: item.status }),
          },
        ],
      }
    },
  )
}
