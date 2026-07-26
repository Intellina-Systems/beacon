import { redirect } from 'next/navigation'
import { and, count, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { engines, teams, knowledgeDocuments, knowledgeSignals } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { listEngineOptions, listTeamOptions } from '@/lib/org/list'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageShell, Panel, PanelHeader } from '@/components/page-shell'
import { KnowledgeForm } from '@/components/knowledge/knowledge-form'
import { OrgTagFilter } from '@/components/work-items/org-tag-filter'
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

function knowledgeHref(docPage: number, sigPage: number, engine?: string, orgTeam?: string) {
  const params = new URLSearchParams()
  if (docPage > 1) params.set('docPage', String(docPage))
  if (sigPage > 1) params.set('sigPage', String(sigPage))
  if (engine) params.set('engine', engine)
  if (orgTeam) params.set('team', orgTeam)
  const qs = params.toString()
  return qs ? `/knowledge?${qs}` : '/knowledge'
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ docPage?: string; sigPage?: string; engine?: string; team?: string }>
}) {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  const workspaceId = ctx.workspaceId

  const params = await searchParams
  const docPage = parsePage(params.docPage)
  const sigPage = parsePage(params.sigPage)
  const [engineOptions, teamOptions] = await Promise.all([listEngineOptions(workspaceId), listTeamOptions(workspaceId)])
  const engine = engineOptions.find((e) => e.id === params.engine)?.id
  const orgTeam = teamOptions.find((f) => f.id === params.team)?.id

  const docsWhere = and(
    eq(knowledgeDocuments.workspaceId, workspaceId),
    engine ? eq(knowledgeDocuments.engineId, engine) : undefined,
    orgTeam ? eq(knowledgeDocuments.teamId, orgTeam) : undefined,
  )

  const [documents, [{ value: docTotal }], signals, [{ value: sigTotal }]] = await Promise.all([
    db
      .select({
        id: knowledgeDocuments.id,
        title: knowledgeDocuments.title,
        sourceType: knowledgeDocuments.sourceType,
        summary: knowledgeDocuments.summary,
        createdAt: knowledgeDocuments.createdAt,
        engineName: engines.name,
        teamName: teams.name,
      })
      .from(knowledgeDocuments)
      .leftJoin(engines, eq(engines.id, knowledgeDocuments.engineId))
      .leftJoin(teams, eq(teams.id, knowledgeDocuments.teamId))
      .where(docsWhere)
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(PAGE_SIZE)
      .offset((docPage - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(knowledgeDocuments).where(docsWhere),
    db
      .select()
      .from(knowledgeSignals)
      .where(eq(knowledgeSignals.workspaceId, workspaceId))
      .orderBy(desc(knowledgeSignals.createdAt))
      .limit(PAGE_SIZE)
      .offset((sigPage - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(knowledgeSignals).where(eq(knowledgeSignals.workspaceId, workspaceId)),
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
            <PanelHeader
              label="Sources"
              meta={
                <div className="flex items-center gap-1.5">
                  {engineOptions.length > 0 && (
                    <OrgTagFilter
                      options={engineOptions}
                      current={engine}
                      paramName="engine"
                      allLabel="Any engine"
                      basePath="/knowledge"
                    />
                  )}
                  {teamOptions.length > 0 && (
                    <OrgTagFilter
                      options={teamOptions}
                      current={orgTeam}
                      paramName="team"
                      allLabel="Any team"
                      basePath="/knowledge"
                    />
                  )}
                  <span className="tabular-nums">{docTotal}</span>
                </div>
              }
            />
            <div className="divide-y px-4">
              {documents.length === 0 ? (
                <EmptyState title="Nothing ingested yet" hint="Paste a note, upload a doc, or add a URL above." />
              ) : (
                documents.map((document) => (
                  <div key={document.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <p className="flex-1 truncate text-sm font-medium">{document.title}</p>
                      {document.engineName && (
                        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
                          {document.engineName}
                        </Badge>
                      )}
                      {document.teamName && (
                        <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
                          {document.teamName}
                        </Badge>
                      )}
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
              hrefFor={(p) => knowledgeHref(p, sigPage, engine, orgTeam)}
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
              hrefFor={(p) => knowledgeHref(docPage, p, engine, orgTeam)}
              className="px-4"
            />
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
