import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { docs } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { listMyDocs, listSharedDocs } from '@/lib/docs/list'
import { generateId } from '@/lib/utils/id'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [myDocs, sharedDocs] = await Promise.all([listMyDocs(ctx), listSharedDocs(ctx)])
  return Response.json({ myDocs, sharedDocs })
}

export async function POST(_req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [doc] = await db
    .insert(docs)
    .values({
      id: generateId(),
      workspaceId: ctx.workspaceId,
      ownerMemberId: ctx.member.id,
      title: 'Untitled',
      content: [],
    })
    .returning()

  return Response.json({ doc }, { status: 201 })
}
