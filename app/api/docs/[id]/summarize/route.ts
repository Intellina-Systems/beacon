import { type NextRequest } from 'next/server'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { resolveDocAccess } from '@/lib/docs/access'
import { blocksToMarkdown } from '@/lib/docs/markdown'
import { summarizeDoc } from '@/lib/docs/summarize'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDocAccess(ctx, id)
  if (!access) return Response.json({ error: 'Not found' }, { status: 404 })

  const markdown = blocksToMarkdown(access.doc.content as unknown[])
  if (!markdown.trim()) return Response.json({ error: 'Nothing to summarize yet' }, { status: 400 })

  const summary = await summarizeDoc({ title: access.doc.title, markdown }).catch(() => null)
  if (!summary) return Response.json({ error: 'Could not summarize this document' }, { status: 502 })

  return Response.json({ summary })
}
