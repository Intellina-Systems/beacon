import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { workspaces } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { isSuperadmin } from '@/lib/auth/permissions'
import { PageShell } from '@/components/page-shell'
import { StatementEditor } from '@/components/founding/statement-editor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vision' }

export default async function VisionPage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/')
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  if (!isSuperadmin(ctx)) redirect('/pulse')

  const [workspace] = await db
    .select({ vision: workspaces.vision })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId))
    .limit(1)

  return (
    <PageShell title="Vision" description="Where this company is headed">
      <StatementEditor field="vision" initialContent={workspace?.vision ?? ''} placeholder="Write the vision…" />
    </PageShell>
  )
}
