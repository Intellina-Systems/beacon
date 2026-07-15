import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { knowledgeDocuments, knowledgeSignals } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KnowledgeForm } from '@/components/knowledge/knowledge-form'
import { relativeTime } from '@/lib/utils/relative-time'

export const dynamic = 'force-dynamic'

const SIGNAL_TONE: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  blocker: 'destructive',
  risk: 'destructive',
  pain_point: 'secondary',
  user_need: 'secondary',
  feature_request: 'secondary',
  decision: 'outline',
  question: 'outline',
}

export default async function KnowledgePage() {
  const session = await getServerSession()
  if (!session?.user) redirect('/')
  const userId = session.user.id

  const [documents, signals] = await Promise.all([
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
      .limit(50),
    db
      .select()
      .from(knowledgeSignals)
      .where(eq(knowledgeSignals.userId, userId))
      .orderBy(desc(knowledgeSignals.createdAt))
      .limit(60),
  ])

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Knowledge</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Meeting notes, docs, and links — parsed into signals the intelligence layer can use.
        </p>
      </div>

      <KnowledgeForm />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sources ({documents.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nothing ingested yet.</p>
            ) : (
              documents.map((document) => (
                <div key={document.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate flex-1">{document.title}</p>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] shrink-0">
                      {document.sourceType}
                    </Badge>
                    <span className="text-xs text-muted-foreground shrink-0">{relativeTime(document.createdAt)}</span>
                  </div>
                  {document.summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{document.summary}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Extracted signals ({signals.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {signals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No signals extracted yet.</p>
            ) : (
              signals.map((signal) => (
                <div key={signal.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge variant={SIGNAL_TONE[signal.kind] ?? 'outline'} className="px-1.5 py-0 text-[10px] shrink-0">
                      {signal.kind.replace('_', ' ')}
                    </Badge>
                    <p className="text-sm font-medium truncate">{signal.title}</p>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">{signal.confidence}/5</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{signal.detail}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
