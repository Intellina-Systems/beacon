import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { ingestEvents } from '@/lib/events/ingest'
import { addRelation, listRelations, RelationError } from '@/lib/work-items/relations'
import { WORK_ITEM_RELATION_TYPES } from '@/lib/db/schema'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const relations = await listRelations(ctx.workspaceId, id)
    return Response.json({ relations })
  } catch (error) {
    if (error instanceof RelationError) return Response.json({ error: error.message }, { status: 404 })
    throw error
  }
}

const createSchema = z.object({
  relatedItemId: z.string().min(1),
  type: z.enum(WORK_ITEM_RELATION_TYPES),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid relation', issues: parsed.error.issues }, { status: 400 })
  }

  const { id } = await params
  const { relatedItemId, type } = parsed.data

  try {
    const result = await addRelation(ctx.workspaceId, id, relatedItemId, type, ctx.member.id)

    const label = type === 'blocks' ? 'blocks' : type === 'duplicate' ? 'marked duplicate of' : 'related to'
    await ingestEvents(
      [
        {
          type: 'task.relation_added',
          source: 'manual',
          summary: `${ctx.member.name} ${label === 'blocks' ? 'linked' : label} between work items`,
          task: id,
          engineer: ctx.member.name,
          payload: { relationType: type, itemId: id, relatedItemId },
        },
      ],
      { workspaceId: ctx.workspaceId },
    )

    if (result.duplicateMerge) {
      await ingestEvents(
        [
          {
            type: 'task.cancelled',
            source: 'manual',
            summary: `Marked duplicate by ${ctx.member.name}; merged into canonical item`,
            task: result.duplicateMerge.duplicateId,
            engineer: ctx.member.name,
            payload: {
              canonicalId: result.duplicateMerge.canonicalId,
              watchersMoved: result.duplicateMerge.watchersMoved,
            },
          },
        ],
        { workspaceId: ctx.workspaceId },
      )
    }

    return Response.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof RelationError) return Response.json({ error: error.message }, { status: 400 })
    throw error
  }
}
