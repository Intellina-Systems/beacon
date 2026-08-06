import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { getVisibleDocs } from '@/lib/docs/tree'
import type { ChatToolContext } from './shared'

export function createListDocsTool({ ctx }: ChatToolContext) {
  return tool({
    description: "List Beacon documents visible to you, optionally scoped to one doc's direct sub-pages.",
    inputSchema: zodSchema(
      z.object({
        parentId: z
          .string()
          .optional()
          .describe('List only direct children of this doc id — omit to list every document visible to you'),
      }),
    ),
    execute: async (input: { parentId?: string }) => {
      const visible = await getVisibleDocs(ctx)
      const filtered = input.parentId ? visible.filter((d) => d.parentId === input.parentId) : visible
      return {
        docs: filtered.map((d) => ({
          id: d.id,
          title: d.title,
          parentId: d.parentId,
          isMine: d.isMine,
          permission: d.permission,
          updatedAt: d.updatedAt.toISOString(),
        })),
      }
    },
  })
}
