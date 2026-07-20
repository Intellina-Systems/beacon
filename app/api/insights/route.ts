import { and, desc, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { insights, members, projects, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') ?? 'active'

  const rows = await db
    .select({
      id: insights.id,
      kind: insights.kind,
      severity: insights.severity,
      title: insights.title,
      detail: insights.detail,
      status: insights.status,
      memberId: insights.memberId,
      memberName: members.name,
      workItemId: insights.workItemId,
      workItemKey: workItems.key,
      workItemTitle: workItems.title,
      projectId: insights.projectId,
      projectName: projects.name,
      createdAt: insights.createdAt,
      updatedAt: insights.updatedAt,
    })
    .from(insights)
    .leftJoin(members, eq(members.id, insights.memberId))
    .leftJoin(workItems, eq(workItems.id, insights.workItemId))
    .leftJoin(projects, eq(projects.id, insights.projectId))
    .where(
      and(
        eq(insights.workspaceId, ctx.workspaceId),
        status === 'all' ? undefined : eq(insights.status, status as never),
      ),
    )
    .orderBy(desc(insights.createdAt))
    .limit(200)

  return Response.json({ insights: rows })
}
