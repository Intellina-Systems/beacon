import { redirect } from 'next/navigation'
import { count, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { knowledgeDocuments, knowledgeSignals } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageShell, Panel, PanelHeader } from '@/components/page-shell'
import { KnowledgeForm } from '@/components/knowledge/knowledge-form'
import { Pagination, parsePage } from '@/components/ui/pagination'
import { relativeTime } from '@/lib/utils/relative-time'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Knowledge' }

const PAGE_SIZE = 20

const SIGNAL_TONE: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  blocker: 'destructive',
  risk: 'destructive',
  pain_point: 'secondary',
  user_need: 'secondary',
  feature_request: 'secondary',
  decision: 'outline',
  question: 'outline',
}

function knowledgeHref(docPage: number, sigPage: number) {
  const params = new URLSearchParams()
  if (docPage > 1) params.set('docPage', String(docPage))
  if (sigPage > 1) params.set('sigPage', String(sigPage))
  const qs = params.toString()
  return qs ? `/knowledge?${qs}` : '/knowledge'
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ docPage?: string; sigPage?: string }>
}) {
  const session = await getServerSession()
  if (!session?.user) redirect('/')
  const userId = session.user.id

  const params = await searchParams
  const docPage = parsePage(params.docPage)
  const sigPage = parsePage(params.sigPage)

  const [documents, [{ value: docTotal }], signals, [{ value: sigTotal }]] = await Promise.all([
    db
      .select({
        id: knowledgeDocuments.id,
        title: knowledgeDocuments.title,
        sourceType: knowledgeDocuments.sourceType,
        summary: knowledgeDocuments.summary,
        createdAt: knowledgeDocuments.createdAt,
      })
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.userId, userId))
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(PAGE_SIZE)
      .offset((docPage - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(knowledgeDocuments).where(eq(knowledgeDocuments.userId, userId)),
    db
      .select()
      .from(knowledgeSignals)
      .where(eq(knowledgeSignals.userId, userId))
      .orderBy(desc(knowledgeSignals.createdAt))
      .limit(PAGE_SIZE)
      .offset((sigPage - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(knowledgeSignals).where(eq(knowledgeSignals.userId, userId)),
  ])

  return (
    <PageShell
      title="Knowledge"
      description="Notes, docs, and links — parsed into signals the intelligence layer can use"
    >
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 lg:px-6">
        <KnowledgeForm />

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Panel>
            <PanelHeader label="Sources" meta={<span className="tabular-nums">{docTotal}</span>} />
            <div className="divide-y px-4">
              {documents.length === 0 ? (
                <EmptyState title="Nothing ingested yet" hint="Paste a note, upload a doc, or add a URL above." />
              ) : (
                documents.map((document) => (
                  <div key={document.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="flex-1 truncate text-sm font-medium">{document.title}</p>
                      <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[10px]">
                        {document.sourceType}
                      </Badge>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {relativeTime(document.createdAt)}
                      </span>
                    </div>
                    {document.summary && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {document.summary}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
            <Pagination
              page={docPage}
              pageCount={Math.max(1, Math.ceil(docTotal / PAGE_SIZE))}
              total={docTotal}
              hrefFor={(p) => knowledgeHref(p, sigPage)}
              className="px-4"
            />
          </Panel>

          <Panel>
            <PanelHeader label="Extracted signals" meta={<span className="tabular-nums">{sigTotal}</span>} />
            <div className="divide-y px-4">
              {signals.length === 0 ? (
                <EmptyState title="No signals extracted yet" hint="Signals appear as sources are parsed." />
              ) : (
                signals.map((signal) => (
                  <div key={signal.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={SIGNAL_TONE[signal.kind] ?? 'outline'}
                        className="shrink-0 px-1.5 py-0 font-mono text-[10px]"
                      >
                        {signal.kind.replace('_', ' ')}
                      </Badge>
                      <p className="truncate text-sm font-medium">{signal.title}</p>
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                        {signal.confidence}/5
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{signal.detail}</p>
                  </div>
                ))
              )}
            </div>
            <Pagination
              page={sigPage}
              pageCount={Math.max(1, Math.ceil(sigTotal / PAGE_SIZE))}
              total={sigTotal}
              hrefFor={(p) => knowledgeHref(docPage, p)}
              className="px-4"
            />
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
