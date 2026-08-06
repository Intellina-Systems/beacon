import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from '@/lib/db/schema'
import { rankAfter } from '@/lib/work-items/rank'
import { maxRank } from '@/lib/work-items/ordering'
import { insertWorkItem } from '@/lib/work-items/create'
import type { ChatToolContext } from './shared'

export function createCreateWorkItemTool({ ctx }: ChatToolContext) {
  return tool({
    description:
      'Propose creating a new task, feature, or epic. This does NOT create anything by itself — the user sees a confirmation card with everything you filled in and must accept it before the item is created.',
    inputSchema: zodSchema(
      z.object({
        title: z.string().min(1).max(300),
        description: z.string().max(50000).optional(),
        kind: z.enum(WORK_ITEM_KINDS).default('task'),
        status: z.enum(WORK_ITEM_STATUSES).default('todo'),
        priority: z.number().int().min(0).max(4).default(0),
        assigneeMemberId: z
          .string()
          .optional()
          .describe('A member id from list_members — leave unset to create unassigned'),
        projectId: z
          .string()
          .optional()
          .describe('A project id from list_projects — defaults to the workspace default project'),
      }),
    ),
    needsApproval: true,
    execute: async (input: {
      title: string
      description?: string
      kind: (typeof WORK_ITEM_KINDS)[number]
      status: (typeof WORK_ITEM_STATUSES)[number]
      priority: number
      assigneeMemberId?: string
      projectId?: string
    }) => {
      // Luna (like other small/fast models) sometimes fills an optional
      // string field with "" instead of omitting it. insertWorkItem's
      // default-project fallback only triggers on null/undefined, so an
      // empty string would sail through as a real projectId and hit the
      // project_id foreign key with a value no project has.
      const assigneeMemberId = input.assigneeMemberId || undefined
      const projectId = input.projectId || undefined

      let assignee: { id: string; name: string } | null = null
      if (assigneeMemberId) {
        const [row] = await db
          .select({ id: members.id, name: members.name })
          .from(members)
          .where(and(eq(members.id, assigneeMemberId), eq(members.workspaceId, ctx.workspaceId)))
          .limit(1)
        if (!row) return { error: 'Assignee is not a member of this workspace' }
        assignee = row
      }

      const rank = rankAfter(await maxRank(ctx.workspaceId))
      const item = await insertWorkItem({
        workspaceId: ctx.workspaceId,
        creator: { id: ctx.member.id, name: ctx.member.name },
        assignee,
        fields: {
          kind: input.kind,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          assigneeMemberId: assignee?.id,
          projectId,
        },
        rank,
      })

      return { id: item.id, key: item.key, title: item.title, status: item.status }
    },
  })
}
