'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Link2, Loader2, MessageSquare, Plus, RefreshCw, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, Panel, PanelHeader } from '@/components/page-shell'

interface KnowledgeDoc {
  id: string
  title: string
  sourceType: string
  sourceUrl: string | null
  summary: string | null
  lastSyncedAt: string | null
  updatedAt: string
}

export interface OrgDocumentsPanelProps {
  /** Exactly one of these identifies the owning org unit. */
  engineId?: string
  teamId?: string
  /** Shown in the chat header once the user jumps across. */
  scopeLabel: string
}

function syncedLabel(doc: KnowledgeDoc): string {
  const iso = doc.lastSyncedAt ?? doc.updatedAt
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'synced just now'
  if (hours < 24) return `synced ${hours}h ago`
  return `synced ${Math.floor(hours / 24)}d ago`
}

export function OrgDocumentsPanel({ engineId, teamId, scopeLabel }: OrgDocumentsPanelProps) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const scopeQuery = engineId ? `engineId=${engineId}` : `teamId=${teamId}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/knowledge?${scopeQuery}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDocs(data.documents ?? [])
    } catch {
      setError('Could not load documents.')
    } finally {
      setLoading(false)
    }
  }, [scopeQuery])

  useEffect(() => {
    void load()
  }, [load])

  function tagBody(form: FormData) {
    if (engineId) form.set('engineId', engineId)
    if (teamId) form.set('teamId', teamId)
    return form
  }

  async function addSource() {
    setSaving(true)
    setError(null)
    try {
      const file = fileRef.current?.files?.[0]
      let res: Response

      if (file) {
        const form = new FormData()
        form.set('file', file)
        if (title.trim()) form.set('title', title.trim())
        res = await fetch('/api/knowledge', { method: 'POST', body: tagBody(form) })
      } else if (url.trim()) {
        res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceUrl: url.trim(), title: title.trim() || undefined, engineId, teamId }),
        })
      } else if (note.trim()) {
        // The ingest schema floors content at 40 chars; catch it here so the
        // user gets a useful message instead of a generic 400.
        if (note.trim().length < 40) {
          setError(`Needs at least 40 characters — ${40 - note.trim().length} more to go.`)
          return
        }
        res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: note.trim(),
            title: title.trim() || 'Untitled note',
            sourceType: 'note',
            engineId,
            teamId,
          }),
        })
      } else {
        setError('Add a file, a link, or some text.')
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'failed')
      }

      setAddOpen(false)
      setUrl('')
      setTitle('')
      setNote('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error && e.message !== 'failed' ? e.message : 'Could not add that source.')
    } finally {
      setSaving(false)
    }
  }

  // Re-reads every source (re-fetching live URLs), regenerates summaries and
  // embeddings, then hands off to chat scoped to this unit.
  async function refreshIntoChat() {
    setRefreshing(true)
    setError(null)
    setStatus('Re-reading documents…')
    try {
      const res = await fetch('/api/knowledge/reingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engineId, teamId }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setStatus(`Refreshed ${data.refreshed}/${data.scanned}. Opening chat…`)

      const params = new URLSearchParams(scopeQuery)
      params.set('scopeLabel', scopeLabel)
      router.push(`/chat?${params.toString()}`)
    } catch {
      setError('Could not refresh documents. Chat will still use the last synced copies.')
      setStatus(null)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Panel>
      <PanelHeader
        label="Documents"
        meta={
          <div className="flex items-center gap-1">
            <span className="tabular-nums">{docs.length}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2"
              onClick={() => setAddOpen(true)}
              aria-label="Add document"
            >
              <Plus className="size-3.5" />
              Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2"
              disabled={refreshing || docs.length === 0}
              onClick={() => void refreshIntoChat()}
            >
              {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Refresh into chat
            </Button>
          </div>
        }
      />

      {(error || status) && (
        <p
          className={`mx-4 mb-2 rounded-md px-3 py-2 text-xs ${
            error ? 'border border-destructive/30 bg-destructive/5 text-destructive' : 'bg-muted text-muted-foreground'
          }`}
        >
          {error ?? status}
        </p>
      )}

      <div className="min-h-0 flex-1 divide-y overflow-y-auto px-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <EmptyState title="No documents yet" hint="Add SOPs, links, or PDFs so Beacon can answer from them." />
        ) : (
          docs.map((doc) => (
            <div key={doc.id} className="flex items-start gap-3 py-2.5 text-sm">
              {doc.sourceUrl ? (
                <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                {doc.sourceUrl ? (
                  <a
                    href={doc.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-medium hover:underline"
                  >
                    {doc.title}
                  </a>
                ) : (
                  <span className="block truncate font-medium">{doc.title}</span>
                )}
                {doc.summary && <p className="truncate text-xs text-muted-foreground">{doc.summary}</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground">{syncedLabel(doc)}</p>
              </div>
              <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                {doc.sourceType.replace(/_/g, ' ')}
              </Badge>
            </div>
          ))
        )}
      </div>

      {docs.length > 0 && (
        <div className="border-t px-4 py-2">
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-muted-foreground">
            <a href={`/chat?${scopeQuery}&scopeLabel=${encodeURIComponent(scopeLabel)}`}>
              <MessageSquare className="size-3.5" />
              Ask without refreshing
            </a>
          </Button>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a document to {scopeLabel}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Title (optional)</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Deployment runbook"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-file">Upload a file</Label>
              <Input id="doc-file" ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.csv,.txt,.md" />
              <p className="text-[11px] text-muted-foreground">PDF, Word, Excel, CSV, text. Up to 10 MB.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-url">…or paste a link</Label>
              <Input
                id="doc-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/document/d/…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-note">…or write it here</Label>
              <Textarea
                id="doc-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="Paste or type the SOP…"
              />
              <p className="text-[11px] text-muted-foreground">At least 40 characters.</p>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void addSource()} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Upload className="mr-1.5 size-4" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
