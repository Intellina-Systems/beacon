import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { resolveDocAccess } from '@/lib/docs/access'
import { createDoc } from '@/lib/docs/create'
import { getVisibleDocs } from '@/lib/docs/tree'
import { LAST_DOC_COOKIE } from '@/lib/docs/last-doc-cookie'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Docs' }

// Landing on bare /docs never shows a picker screen — it drops straight into
// an editor, resuming whatever doc was last open this browser session (see
// last-doc-cookie.ts). Creating a fresh blank doc is the LAST resort, only
// for a member with no docs at all — a stale/missing cookie (e.g. the doc it
// pointed at just got deleted) falls back to any doc the member already has,
// not straight to manufacturing a new one. That fallback used to skip
// straight to createDoc, which is exactly what was littering the workspace
// with throwaway "Untitled" pages every time a resume target went stale.
export default async function DocsPage() {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')

  const lastDocId = (await cookies()).get(LAST_DOC_COOKIE)?.value
  if (lastDocId && (await resolveDocAccess(ctx, lastDocId))) {
    redirect(`/docs/${lastDocId}`)
  }

  const existing = await getVisibleDocs(ctx)
  if (existing.length > 0) {
    const mostRecent = existing.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b))
    redirect(`/docs/${mostRecent.id}`)
  }

  const doc = await createDoc(ctx, {})
  redirect(`/docs/${doc.id}`)
}
