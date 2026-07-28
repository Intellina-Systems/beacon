import { and, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { members, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { visibleMemberIds } from '@/lib/auth/permissions'

const LIMIT = 8

export interface MentionMember {
  id: string
  name: string
  title: string | null
  avatarUrl: string | null
}

export interface MentionWorkItem {
  id: string
  key: string | null
  title: string
  status: string
}

/**
 * Typeahead source for the doc editor's `@` (person) and `#` (work item)
 * suggestion menus. Both halves are fetched in one round trip so opening a
 * menu costs a single request instead of two racing ones.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const like = `%${q}%`

  const memberConditions: (SQL | undefined)[] = [eq(members.workspaceId, ctx.workspaceId)]
  if (q) memberConditions.push(ilike(members.name, like))

  const itemConditions: (SQL | undefined)[] = [eq(workItems.workspaceId, ctx.workspaceId)]
  if (q) itemConditions.push(or(ilike(workItems.title, like), ilike(workItems.key, like)))

  // Same visibility rule the work list uses: non-admins only see items assigned
  // to people they're allowed to see (plus unassigned ones).
  const visible = await visibleMemberIds(ctx)
  if (visible) {
    itemConditions.push(
      or(
        inArray(workItems.assigneeMemberId, visible.length ? visible : ['__none__']),
        isNull(workItems.assigneeMemberId),
      ),
    )
  }

  const [memberRows, itemRows] = await Promise.all([
    db
      .select({ id: members.id, name: members.name, title: members.title, avatarUrl: members.avatarUrl })
      .from(members)
      .where(and(...memberConditions))
      .orderBy(members.name)
      .limit(LIMIT),
    db
      .select({ id: workItems.id, key: workItems.key, title: workItems.title, status: workItems.status })
      .from(workItems)
      .where(and(...itemConditions))
      .orderBy(workItems.key)
      .limit(LIMIT),
  ])

  return Response.json({ members: memberRows, workItems: itemRows })
}
