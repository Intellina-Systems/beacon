import { type NextRequest } from 'next/server'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ingestEvents } from '@/lib/events/ingest'
import { removeRelation } from '@/lib/work-items/relations'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; relationId: string }> },
): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, relationId } = await params
  const removed = await removeRelation(ctx.workspaceId, relationId)
  if (!removed) return Response.json({ error: 'Not found' }, { status: 404 })

  await ingestEvents(
    [
      {
        type: 'task.relation_removed',
        source: 'manual',
        summary: `${ctx.member.name} removed a relation`,
        task: id,
        engineer: ctx.member.name,
        payload: { relationId },
      },
    ],
    { workspaceId: ctx.workspaceId },
  )

  return Response.json({ success: true })
}
