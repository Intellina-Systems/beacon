import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docs } from '@/lib/db/schema'
import { resolveDocAccess } from '@/lib/docs/access'
import { markdownToBlocks } from '@/lib/docs/markdown'
import type { ChatToolContext } from './shared'

export function createUpdateDocTool({ ctx }: ChatToolContext) {
  return tool({
    description:
      'Propose renaming a Beacon document and/or replacing or appending its content. Requires edit access. Nothing changes until the user confirms.',
    inputSchema: zodSchema(
      z
        .object({
          docId: z.string().describe('A doc id from list_docs, create_doc, or get_doc'),
          title: z.string().min(1).max(300).optional(),
          content: z.string().max(50000).optional().describe('Replaces the document content entirely (markdown)'),
          appendContent: z
            .string()
            .max(50000)
            .optional()
            .describe('Appends markdown content after the existing content, instead of replacing it'),
        })
        .refine((d) => !(d.content !== undefined && d.appendContent !== undefined), {
          message: 'Use either content or appendContent, not both',
        })
        .refine((d) => d.title !== undefined || d.content !== undefined || d.appendContent !== undefined, {
          message: 'Nothing to update',
        }),
    ),
    needsApproval: true,
    execute: async (input: { docId: string; title?: string; content?: string; appendContent?: string }) => {
      const access = await resolveDocAccess(ctx, input.docId)
      if (!access) return { error: 'Document not found' }
      if (access.permission !== 'edit') return { error: "You don't have edit access to this document" }

      const updates: { title?: string; content?: unknown[] } = {}
      if (input.title) updates.title = input.title.trim()
      if (input.content !== undefined) {
        updates.content = markdownToBlocks(input.content)
      } else if (input.appendContent !== undefined) {
        updates.content = [...access.doc.content, ...markdownToBlocks(input.appendContent)]
      }

      const [updated] = await db
        .update(docs)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(docs.id, input.docId))
        .returning()

      return { id: updated.id, title: updated.title }
    },
  })
}
