import { and, asc, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { cycles, members, workItems } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canViewAllTeams, forbidden } from '@/lib/auth/permissions'
import { listSnapshots } from '@/lib/cycles/snapshots'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const [cycle] = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.id, id), eq(cycles.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!cycle) return Response.json({ error: 'Not found' }, { status: 404 })

  const [items, snapshots] = await Promise.all([
    db
      .select({
        id: workItems.id,
        key: workItems.key,
        title: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        estimate: workItems.estimate,
        assigneeName: members.name,
      })
      .from(workItems)
      .leftJoin(members, eq(members.id, workItems.assigneeMemberId))
      .where(eq(workItems.cycleId, cycle.id))
      .orderBy(asc(workItems.rank), asc(workItems.createdAt)),
    listSnapshots(cycle.id),
  ])

  return Response.json({ cycle, items, snapshots })
}

const patchSchema = z.object({ name: z.string().max(100).nullable() })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canViewAllTeams(ctx)) return forbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid update', issues: parsed.error.issues }, { status: 400 })

  const { id } = await params
  const [cycle] = await db
    .update(cycles)
    .set({ name: parsed.data.name, updatedAt: new Date() })
    .where(and(eq(cycles.id, id), eq(cycles.workspaceId, ctx.workspaceId)))
    .returning()

  if (!cycle) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ cycle })
}
