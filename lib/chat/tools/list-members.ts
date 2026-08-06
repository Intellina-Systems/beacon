import 'server-only'

import { z } from 'zod'
import { tool, zodSchema } from 'ai'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import type { ChatToolContext } from './shared'

export function createListMembersTool({ workspaceId }: ChatToolContext) {
  return tool({
    description:
      "List the workspace roster, for resolving a person's name to the member id create_work_item/update_work_item/add_comment need. Roster names are visible to everyone, regardless of role.",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const rows = await db
        .select({ id: members.id, name: members.name, title: members.title, accessRole: members.accessRole })
        .from(members)
        .where(eq(members.workspaceId, workspaceId))
        .orderBy(asc(members.name))
      return { members: rows }
    },
  })
}
