import { notFound, redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { resolveDocAccess } from '@/lib/docs/access'
import { PageShell } from '@/components/page-shell'
import { DocEditorClient } from '@/components/docs/doc-editor-client'
import { ShareDocDialog } from '@/components/docs/share-doc-dialog'
import { DeleteDocButton } from '@/components/docs/delete-doc-button'

export const dynamic = 'force-dynamic'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')

  const { id } = await params
  const access = await resolveDocAccess(ctx, id)
  if (!access) notFound()

  const ownerName = access.isOwner
    ? ctx.member.name
    : ((
        await db.select({ name: members.name }).from(members).where(eq(members.id, access.doc.ownerMemberId)).limit(1)
      )[0]?.name ?? 'Someone')

  return (
    <PageShell
      title={access.doc.title || 'Untitled'}
      actions={
        access.isOwner ? (
          <div className="flex items-center gap-2">
            <ShareDocDialog docId={access.doc.id} ownerName={ownerName} />
            <DeleteDocButton docId={access.doc.id} />
          </div>
        ) : undefined
      }
    >
      <DocEditorClient doc={access.doc} editable={access.permission === 'edit'} />
    </PageShell>
  )
}
