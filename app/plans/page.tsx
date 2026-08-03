import { redirect } from 'next/navigation'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { isAdmin } from '@/lib/auth/permissions'
import { getPlansHistory } from '@/lib/plans/queries'
import { PageShell } from '@/components/page-shell'
import { PlansHistoryTable } from '@/components/plans/plans-history-table'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Plans' }

export default async function PlansPage() {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  if (!isAdmin(ctx)) redirect('/pulse')

  const history = await getPlansHistory(ctx.workspaceId, 14)

  return (
    <PageShell title="Plans" description="Every member's daily plan, done or pending" fixed>
      <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 lg:px-6">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
          <PlansHistoryTable rows={history} />
        </div>
      </div>
    </PageShell>
  )
}
