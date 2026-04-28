'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Paperclip, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type KnowledgeSourceType = 'note' | 'email' | 'doc' | 'pdf' | 'whatsapp' | 'other'

type KnowledgeDocument = {
  id: string
  title: string
  sourceType: KnowledgeSourceType
  summary: string | null
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

const SIGNAL_LABEL: Record<string, string> = {
  user_need: 'User need',
  pain_point: 'Pain point',
  feature_request: 'Feature request',
  blocker: 'Blocker',
  risk: 'Risk',
  decision: 'Decision',
  question: 'Question',
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

export function KnowledgeIngestion({ productId, documents, signals }: KnowledgeIngestionProps) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>('note')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const canSubmit = Boolean(title.trim()) && (file !== null || content.trim().length >= 40)

  function handleFileChange(selectedFile: File | null) {
    if (!selectedFile) {
      setFile(null)
      return
    }

    if (selectedFile.type !== 'application/pdf') {
      toast.error('Choose a PDF file.')
      return
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('PDF must be 10MB or smaller.')
      return
    }

    setFile(selectedFile)
    setSourceType('pdf')
    if (!title.trim()) {
      setTitle(selectedFile.name.replace(/\.pdf$/i, ''))
    }
  }

  async function ingestKnowledge() {
    setLoading(true)
    try {
      const body =
        file !== null
          ? (() => {
              const formData = new FormData()
              formData.set('title', title)
              formData.set('file', file)
              return formData
            })()
          : JSON.stringify({ title, sourceType, content })

      const response = await fetch(`/api/products/${productId}/knowledge`, {
        method: 'POST',
        headers: file === null ? { 'Content-Type': 'application/json' } : undefined,
        body,
      })

      if (response.ok) {
        const data = (await response.json()) as KnowledgeIngestResponse
        setTitle('')
        setSourceType('note')
        setContent('')
        setFile(null)
        if (data.extractionStatus === 'complete') {
          toast.success('Knowledge ingested and signals extracted.')
        } else {
          toast.success('Knowledge source saved. Signal extraction can be retried later.')
        }
        router.refresh()
      } else {
        toast.error(await getErrorMessage(response, 'Failed to ingest knowledge'))
      }
    } finally {
      setLoading(false)
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
          <CardDescription>Paste notes or upload a PDF to extract product signals.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="knowledge-title">Title</Label>
            <Input
              id="knowledge-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Customer onboarding call"
            />
          </div>

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
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="knowledge-pdf">PDF upload</Label>
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
                  htmlFor="knowledge-pdf"
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-1 py-1 text-sm"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Paperclip className="h-4 w-4" />
                    Choose a PDF up to 10MB
                  </span>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span>Browse</span>
                  </Button>
                </label>
              )}
              <Input
                id="knowledge-pdf"
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="knowledge-content">Content</Label>
            <Textarea
              id="knowledge-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Paste source text..."
              className="min-h-56 resize-y"
              disabled={file !== null}
            />
          </div>

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
              documents.map((document) => (
                <div key={document.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{document.title}</p>
                    <span className="text-xs text-muted-foreground">{formatDate(document.createdAt)}</span>
                  </div>
                  {document.summary && <p className="mt-1 line-clamp-2 text-muted-foreground">{document.summary}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
