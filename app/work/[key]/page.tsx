import { notFound, redirect } from 'next/navigation'
import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, projects, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { isAdmin, visibleMemberIds } from '@/lib/auth/permissions'
import { WorkItemPage } from '@/components/work-items/detail/work-item-page'

export const dynamic = 'force-dynamic'

// The segment accepts either the human key ("BEA-11", what people paste to each
// other) or the raw id (what deep links from Pulse and the inbox carry).
async function resolveItem(workspaceId: string, keyOrId: string) {
  const [row] = await db
    .select({
      id: workItems.id,
      key: workItems.key,
      title: workItems.title,
      projectName: projects.name,
    })
    .from(workItems)
    .leftJoin(projects, eq(projects.id, workItems.projectId))
    .where(
      and(
        eq(workItems.workspaceId, workspaceId),
        or(eq(workItems.id, keyOrId), eq(workItems.key, keyOrId.toUpperCase())),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await getWorkspaceContext()
  if (!ctx) return { title: 'Work' }
  const { key } = await params
  const item = await resolveItem(ctx.workspaceId, decodeURIComponent(key))
  if (!item) return { title: 'Work item' }
  return { title: item.key ? `${item.key} · ${item.title}` : item.title }
}

export default async function WorkItemDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')

  const { key } = await params
  const keyOrId = decodeURIComponent(key)
  const item = await resolveItem(ctx.workspaceId, keyOrId)
  if (!item) notFound()

  // Canonicalise on the key so shared links stay readable and stable.
  if (item.key && item.key !== keyOrId) redirect(`/work/${encodeURIComponent(item.key)}`)

  const [fullRoster, visible] = await Promise.all([
    db
      .select({ id: members.id, name: members.name })
      .from(members)
      .where(eq(members.workspaceId, ctx.workspaceId))
      .orderBy(members.name),
    visibleMemberIds(ctx),
  ])
  const roster = visible ? fullRoster.filter((m) => visible.includes(m.id)) : fullRoster

  return (
    <WorkItemPage
      itemId={item.id}
      roster={roster}
      currentMemberId={ctx.member.id}
      canModerate={isAdmin(ctx)}
      projectName={item.projectName}
    />
  )
}
