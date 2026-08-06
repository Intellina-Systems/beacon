import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { createDoc } from '@/lib/docs/create'
import { resolveDocAccess } from '@/lib/docs/access'
import { markdownToBlocks } from '@/lib/docs/markdown'
import type { ChatToolContext } from './shared'

export function createCreateDocTool({ ctx }: ChatToolContext) {
  return tool({
    description:
      'Propose creating a new Beacon document (block-based, shareable, nestable). Nothing is created until the user confirms.',
    inputSchema: zodSchema(
      z.object({
        title: z.string().min(1).max(300),
        content: z
          .string()
          .max(50000)
          .optional()
          .describe(
            'Markdown content. Supports headings (#), bullet/numbered/check lists (-, 1., - [ ]), quotes (>), dividers (---), links, and inline **bold**/*italic*/`code`.',
          ),
        parentId: z
          .string()
          .optional()
          .describe('A doc id from list_docs — creates this as a sub-page, inheriting its sharing from the parent'),
      }),
    ),
    needsApproval: true,
    execute: async (input: { title: string; content?: string; parentId?: string }) => {
      if (input.parentId) {
        const parentAccess = await resolveDocAccess(ctx, input.parentId)
        if (!parentAccess) return { error: 'Parent document not found' }
        if (parentAccess.permission !== 'edit') return { error: "You don't have edit access to that parent document" }
      }

      const doc = await createDoc(ctx, {
        parentId: input.parentId,
        title: input.title,
        content: input.content ? markdownToBlocks(input.content) : undefined,
      })
      return { id: doc.id, title: doc.title, parentId: doc.parentId }
    },
  })
}
