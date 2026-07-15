'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileSpreadsheet, FileText, Link2, Loader2, Paperclip, RefreshCw, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type KnowledgeSourceType =
  | 'note'
  | 'email'
  | 'doc'
  | 'pdf'
  | 'whatsapp'
  | 'word'
  | 'excel'
  | 'notion'
  | 'google_doc'
  | 'google_sheet'
  | 'url'
  | 'other'

type KnowledgeDocument = {
  id: string
  title: string
  sourceType: KnowledgeSourceType
  sourceUrl: string | null
  summary: string | null
  lastSyncedAt: Date | string | null
  createdAt: Date | string
}

type KnowledgeSignal = {
  id: string
  kind: string
  title: string
  detail: string
  evidence: string | null
  confidence: number
}

type ApiError = {
  error?: string
}

type KnowledgeIngestResponse = {
  extractionStatus?: 'complete' | 'stored_without_signals' | 'stored_without_summary'
}

interface KnowledgeIngestionProps {
  productId: string
  documents: KnowledgeDocument[]
  signals: KnowledgeSignal[]
}

type IngestMode = 'paste' | 'file' | 'link'

const SIGNAL_LABEL: Record<string, string> = {
  user_need: 'User need',
  pain_point: 'Pain point',
  feature_request: 'Feature request',
  blocker: 'Blocker',
  risk: 'Risk',
  decision: 'Decision',
  question: 'Question',
}

const SOURCE_TYPE_LABEL: Record<KnowledgeSourceType, string> = {
  note: 'Note',
  email: 'Email',
  doc: 'Doc',
  pdf: 'PDF',
  whatsapp: 'WhatsApp',
  word: 'Word doc',
  excel: 'Spreadsheet',
  notion: 'Notion',
  google_doc: 'Google Doc',
  google_sheet: 'Google Sheet',
  url: 'Web page',
  other: 'Other',
}

const SPREADSHEET_TYPES: KnowledgeSourceType[] = ['excel', 'google_sheet']
const LINK_TYPES: KnowledgeSourceType[] = ['notion', 'google_doc', 'google_sheet', 'url']

function sourceTypeIcon(sourceType: KnowledgeSourceType) {
  if (SPREADSHEET_TYPES.includes(sourceType)) return FileSpreadsheet
  if (LINK_TYPES.includes(sourceType)) return Link2
  return FileText
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function getErrorMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as ApiError
    return data.error ?? fallback
  } catch {
    return fallback
  }
}

function detectClientFileKind(file: File): 'pdf' | 'word' | 'excel' | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return 'word'
  }
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel' ||
    file.type === 'text/csv' ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv')
  ) {
    return 'excel'
  }
  return null
}

export function KnowledgeIngestion({ productId, documents, signals }: KnowledgeIngestionProps) {
  const router = useRouter()
  const [mode, setMode] = useState<IngestMode>('paste')
  const [title, setTitle] = useState('')
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>('note')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const canSubmit =
    mode === 'paste'
      ? Boolean(title.trim()) && content.trim().length >= 40
      : mode === 'file'
        ? Boolean(title.trim()) && file !== null
        : linkUrl.trim().length > 0

  function handleFileChange(selectedFile: File | null) {
    if (!selectedFile) {
      setFile(null)
      return
    }

    const kind = detectClientFileKind(selectedFile)
    if (!kind) {
      toast.error('Choose a PDF, Word (.docx), or spreadsheet (.xlsx/.xls/.csv) file.')
      return
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('File must be 10MB or smaller.')
      return
    }

    setFile(selectedFile)
    if (!title.trim()) {
      setTitle(selectedFile.name.replace(/\.[a-z0-9]+$/i, ''))
    }
  }

  function resetForm() {
    setTitle('')
    setSourceType('note')
    setContent('')
    setFile(null)
    setLinkUrl('')
  }

  function handleIngestResult(data: KnowledgeIngestResponse) {
    if (data.extractionStatus === 'complete') {
      toast.success('Knowledge ingested and signals extracted.')
    } else {
      toast.success('Knowledge source saved. Signal extraction can be retried later.')
    }
  }

  async function ingestKnowledge() {
    setLoading(true)
    try {
      let body: BodyInit
      let headers: HeadersInit | undefined

      if (mode === 'file' && file) {
        const formData = new FormData()
        formData.set('title', title)
        formData.set('file', file)
        body = formData
      } else if (mode === 'link') {
        headers = { 'Content-Type': 'application/json' }
        body = JSON.stringify({ title: title.trim() || undefined, sourceUrl: linkUrl.trim() })
      } else {
        headers = { 'Content-Type': 'application/json' }
        body = JSON.stringify({ title, sourceType, content })
      }

      const response = await fetch(`/api/products/${productId}/knowledge`, {
        method: 'POST',
        headers,
        body,
      })

      if (response.ok) {
        const data = (await response.json()) as KnowledgeIngestResponse
        resetForm()
        handleIngestResult(data)
        router.refresh()
      } else {
        toast.error(await getErrorMessage(response, 'Failed to ingest knowledge'))
      }
    } finally {
      setLoading(false)
    }
  }

  async function resyncDocument(documentId: string) {
    setSyncingId(documentId)
    try {
      const response = await fetch(`/api/products/${productId}/knowledge/${documentId}/resync`, {
        method: 'POST',
      })

      if (response.ok) {
        const data = (await response.json()) as KnowledgeIngestResponse
        toast.success(
          data.extractionStatus === 'complete' ? 'Source re-synced.' : 'Source re-synced (retry signals later).',
        )
        router.refresh()
      } else {
        toast.error(await getErrorMessage(response, 'Failed to re-sync source'))
      }
    } finally {
      setSyncingId(null)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Ingest Knowledge
          </CardTitle>
          <CardDescription>Paste notes, upload a file, or add a link to extract product signals.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs value={mode} onValueChange={(value) => setMode(value as IngestMode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="paste">Paste text</TabsTrigger>
              <TabsTrigger value="file">Upload file</TabsTrigger>
              <TabsTrigger value="link">Add link</TabsTrigger>
            </TabsList>

            <div className="mt-4 grid gap-2">
              <Label htmlFor="knowledge-title">Title</Label>
              <Input
                id="knowledge-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Customer onboarding call"
              />
              {mode === 'link' && (
                <p className="text-xs text-muted-foreground">Leave blank to use the page&apos;s own title.</p>
              )}
            </div>

            <TabsContent value="paste" className="mt-4 flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="knowledge-source">Source</Label>
                <Select value={sourceType} onValueChange={(value) => setSourceType(value as KnowledgeSourceType)}>
                  <SelectTrigger id="knowledge-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="doc">Doc</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="knowledge-content">Content</Label>
                <Textarea
                  id="knowledge-content"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Paste source text..."
                  className="min-h-56 resize-y"
                />
              </div>
            </TabsContent>

            <TabsContent value="file" className="mt-4">
              <div className="grid gap-2">
                <Label htmlFor="knowledge-file">File upload</Label>
                <div className="rounded-md border border-dashed bg-muted/20 p-3">
                  {file ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-background">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{Math.ceil(file.size / 1024)} KB</p>
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label
                      htmlFor="knowledge-file"
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-1 py-1 text-sm"
                    >
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Paperclip className="h-4 w-4" />
                        PDF, Word (.docx), or spreadsheet, up to 10MB
                      </span>
                      <Button type="button" variant="outline" size="sm" asChild>
                        <span>Browse</span>
                      </Button>
                    </label>
                  )}
                  <Input
                    id="knowledge-file"
                    type="file"
                    accept=".pdf,.docx,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    className="sr-only"
                    onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="link" className="mt-4">
              <div className="grid gap-2">
                <Label htmlFor="knowledge-link">Link</Label>
                <Input
                  id="knowledge-link"
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="https://notion.so/... or https://docs.google.com/..."
                />
                <p className="text-xs text-muted-foreground">
                  Works with public Notion pages (&quot;Share to web&quot;), Google Docs/Sheets shared as &quot;Anyone
                  with the link&quot;, and other public web pages. Use the Sync button later to pull in updates.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <Button onClick={ingestKnowledge} disabled={loading || !canSubmit}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Extract Signals
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Signals
            </CardTitle>
            <CardDescription>{signals.length} product signals extracted from knowledge sources.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {signals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No knowledge signals yet.</p>
            ) : (
              signals.map((signal) => (
                <div key={signal.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{signal.title}</p>
                    <Badge variant="secondary">{SIGNAL_LABEL[signal.kind] ?? signal.kind}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">{signal.detail}</p>
                  {signal.evidence && <p className="mt-2 text-xs text-muted-foreground">Evidence: {signal.evidence}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">Confidence {signal.confidence}/5</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sources</CardTitle>
            <CardDescription>Recent knowledge inputs for this product.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sources ingested yet.</p>
            ) : (
              documents.map((document) => {
                const Icon = sourceTypeIcon(document.sourceType)
                const isSyncing = syncingId === document.id

                return (
                  <div key={document.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <p className="truncate font-medium">{document.title}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                          {SOURCE_TYPE_LABEL[document.sourceType] ?? document.sourceType}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(document.createdAt)}</span>
                      </div>
                    </div>
                    {document.summary && <p className="mt-1 line-clamp-2 text-muted-foreground">{document.summary}</p>}
                    {document.sourceUrl && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <a
                          href={document.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-xs text-muted-foreground hover:underline"
                        >
                          {document.sourceUrl}
                        </a>
                        <button
                          type="button"
                          onClick={() => resyncDocument(document.id)}
                          disabled={isSyncing}
                          className={cn(
                            'flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60',
                          )}
                        >
                          <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
                          {isSyncing ? 'Syncing…' : document.lastSyncedAt ? 'Sync' : 'Sync now'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
