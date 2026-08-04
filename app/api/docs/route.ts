import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { listMyDocs, listSharedDocs } from '@/lib/docs/list'
import { getDocTree } from '@/lib/docs/tree'
import { resolveDocAccess } from '@/lib/docs/access'
import { createDoc } from '@/lib/docs/create'

export async function GET(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // ?tree=1 returns the unified nested structure (used by the sidebar's
  // docs-sidebar-tree.tsx); the default flat shape stays for any other consumer.
  if (new URL(req.url).searchParams.get('tree') === '1') {
    return Response.json({ tree: await getDocTree(ctx) })
  }

  const [myDocs, sharedDocs] = await Promise.all([listMyDocs(ctx), listSharedDocs(ctx)])
  return Response.json({ myDocs, sharedDocs })
}

const createSchema = z.object({ parentId: z.string().optional() })

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  if (parsed.data.parentId) {
    const parentAccess = await resolveDocAccess(ctx, parsed.data.parentId)
    if (!parentAccess) return Response.json({ error: 'Parent document not found' }, { status: 404 })
    if (parentAccess.permission !== 'edit') {
      return Response.json({ error: "You don't have edit access to that parent document" }, { status: 403 })
    }
  }

  const doc = await createDoc(ctx, { parentId: parsed.data.parentId ?? null })
  return Response.json({ doc }, { status: 201 })
}
