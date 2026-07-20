import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { members, workItems } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { addWatchers, listWatchers, removeWatcher } from '@/lib/work-items/watchers'

async function assertItemInWorkspace(workspaceId: string, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workItems.id })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, workspaceId)))
    .limit(1)
  return !!row
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await assertItemInWorkspace(ctx.workspaceId, id))) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const watchers = await listWatchers(id)
  return Response.json({ watchers })
}

const addSchema = z.object({ memberId: z.string().min(1).optional() })

// Adds a watcher — the caller themself by default, or a specified member
// (e.g. an admin subscribing someone else to an item).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await assertItemInWorkspace(ctx.workspaceId, id))) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const parsed = addSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const memberId = parsed.data.memberId ?? ctx.member.id
  if (memberId !== ctx.member.id) {
    const [row] = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!row) return Response.json({ error: 'Member not found in this workspace' }, { status: 400 })
  }

  await addWatchers(ctx.workspaceId, id, [{ memberId, reason: 'manual' }])
  return Response.json({ success: true }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const memberId = req.nextUrl.searchParams.get('memberId') ?? ctx.member.id

  const removed = await removeWatcher(id, memberId)
  if (!removed) return Response.json({ error: 'Not watching' }, { status: 404 })
  return Response.json({ success: true })
}
