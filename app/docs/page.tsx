import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileText, Lock, Users } from 'lucide-react'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { listMyDocs, listSharedDocs } from '@/lib/docs/list'
import { PageShell, EmptyState } from '@/components/page-shell'
import { NewDocButton } from '@/components/docs/new-doc-button'
import { Badge } from '@/components/ui/badge'
import { relativeTime } from '@/lib/utils/relative-time'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Docs' }

export default async function DocsPage() {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')

  const [myDocs, sharedDocs] = await Promise.all([listMyDocs(ctx), listSharedDocs(ctx)])

  return (
    <PageShell
      title="Docs"
      description="Personal, block-based documents you can share"
      actions={<NewDocButton />}
      fixed
    >
      <div className="flex h-full min-h-0 w-full flex-col px-4 py-4 lg:px-6">
        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto pb-2">
          <section>
            <p className="micro-label mb-2">My documents</p>
            {myDocs.length === 0 ? (
              <div className="flex rounded-lg border border-dashed">
                <EmptyState
                  title="No documents yet"
                  hint="Create your first document — it starts private, just for you."
                />
              </div>
            ) : (
              <div className="divide-y overflow-hidden rounded-lg border bg-card">
                {myDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/docs/${doc.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-accent/60"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title || 'Untitled'}</span>
                    {doc.shareMode === 'workspace' ? (
                      <Badge variant="outline" className="shrink-0 gap-1 text-[10px] text-muted-foreground">
                        <Users className="h-2.5 w-2.5" />
                        Shared
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 gap-1 text-[10px] text-muted-foreground">
                        <Lock className="h-2.5 w-2.5" />
                        Private
                      </Badge>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(doc.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="micro-label mb-2">Shared with me</p>
            {sharedDocs.length === 0 ? (
              <div className="flex rounded-lg border border-dashed">
                <EmptyState
                  title="Nothing shared with you yet"
                  hint="Documents other people share with you show up here."
                />
              </div>
            ) : (
              <div className="divide-y overflow-hidden rounded-lg border bg-card">
                {sharedDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/docs/${doc.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-accent/60"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title || 'Untitled'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">by {doc.ownerName}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                      {doc.permission === 'edit' ? 'Can edit' : 'Can view'}
                    </Badge>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(doc.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  )
}
