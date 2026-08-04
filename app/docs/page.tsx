import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { resolveDocAccess } from '@/lib/docs/access'
import { createDoc } from '@/lib/docs/create'
import { LAST_DOC_COOKIE } from '@/lib/docs/last-doc-cookie'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Docs' }

// Landing on bare /docs never shows a picker screen — it drops straight into
// an editor, resuming whatever doc was last open this browser session (see
// last-doc-cookie.ts), or creating a fresh one on a doc-less first visit.
export default async function DocsPage() {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')

  const lastDocId = (await cookies()).get(LAST_DOC_COOKIE)?.value
  if (lastDocId && (await resolveDocAccess(ctx, lastDocId))) {
    redirect(`/docs/${lastDocId}`)
  }

  const doc = await createDoc(ctx, {})
  redirect(`/docs/${doc.id}`)
}
