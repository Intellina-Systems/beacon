import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { resolveDocAccess } from '@/lib/docs/access'
import { blocksToMarkdown } from '@/lib/docs/markdown'
import type { ChatToolContext } from './shared'

export function createGetDocTool({ ctx }: ChatToolContext) {
  return tool({
    description:
      "Fetch a Beacon document's content as markdown, along with its title and where it sits in the doc tree.",
    inputSchema: zodSchema(
      z.object({ docId: z.string().describe('A doc id from list_docs, create_doc, or search_knowledge') }),
    ),
    execute: async (input: { docId: string }) => {
      const access = await resolveDocAccess(ctx, input.docId)
      if (!access) return { error: 'Document not found' }
      return {
        id: access.doc.id,
        title: access.doc.title,
        parentId: access.doc.parentId,
        permission: access.permission,
        content: blocksToMarkdown(access.doc.content),
      }
    },
  })
}
