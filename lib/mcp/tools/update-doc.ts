import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { McpServer, ServerContext } from '@modelcontextprotocol/server'
import { db } from '@/lib/db/client'
import { docs } from '@/lib/db/schema'
import { resolveDocAccess } from '@/lib/docs/access'
import { markdownToBlocks } from '@/lib/docs/markdown'
import { requireMemberContext } from '../context'

const inputSchema = z
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
  })

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

export function registerUpdateDocTool(server: McpServer) {
  server.registerTool(
    'update_doc',
    {
      title: 'Update document',
      description: 'Rename a Beacon document and/or replace or append its content. Requires edit access.',
      inputSchema,
    },
    async (input, ctx: ServerContext) => {
      let workspaceCtx
      try {
        workspaceCtx = await requireMemberContext(ctx)
      } catch (error) {
        return toolError(error instanceof Error ? error.message : 'Not authorized')
      }

      const access = await resolveDocAccess(workspaceCtx, input.docId)
      if (!access) return toolError('Document not found')
      if (access.permission !== 'edit') return toolError("You don't have edit access to this document")

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

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ id: updated.id, title: updated.title }) }],
      }
    },
  )
}
