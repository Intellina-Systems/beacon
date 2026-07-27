'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Link2, Plus, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

interface Option {
  id: string
  name: string
}

export function KnowledgeForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [engineId, setEngineId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [engineOptions, setEngineOptions] = useState<Option[]>([])
  const [teamOptions, setTeamOptions] = useState<Option[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([fetch('/api/engines').then((res) => res.json()), fetch('/api/teams').then((res) => res.json())])
      .then(([engineData, teamData]) => {
        setEngineOptions((engineData.engines ?? []).map((e: Option) => ({ id: e.id, name: e.name })))
        setTeamOptions((teamData.teams ?? []).map((f: Option) => ({ id: f.id, name: f.name })))
      })
      .catch(() => {})
  }, [])

  async function handle(res: Response) {
    if (res.ok) {
      toast.success('Ingested — signals extracted')
      setTitle('')
      setContent('')
      setUrl('')
      setEngineId('')
      setTeamId('')
      setOpen(false)
      router.refresh()
    } else {
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? 'Ingestion failed')
    }
  }

  async function submitNote() {
    setBusy(true)
    try {
      await handle(
        await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            content: content.trim(),
            sourceType: 'note',
            engineId: engineId || undefined,
            teamId: teamId || undefined,
          }),
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  async function submitUrl() {
    setBusy(true)
    try {
      await handle(
        await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceUrl: url.trim(),
            title: title.trim() || undefined,
            engineId: engineId || undefined,
            teamId: teamId || undefined,
          }),
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  async function submitFile(file: File) {
    setBusy(true)
    try {
      const formData = new FormData()
      formData.set('file', file)
      if (engineId) formData.set('engineId', engineId)
      if (teamId) formData.set('teamId', teamId)
      await handle(await fetch('/api/knowledge', { method: 'POST', body: formData }))
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function engineTeamFields() {
    if (engineOptions.length === 0 && teamOptions.length === 0) return null
    return (
      <div className="grid grid-cols-2 gap-3">
        {engineOptions.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Engine</Label>
            <Select value={engineId || 'none'} onValueChange={(v) => setEngineId(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No engine</SelectItem>
                {engineOptions.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {teamOptions.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Team</Label>
            <Select value={teamId || 'none'} onValueChange={(v) => setTeamId(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No team</SelectItem>
                {teamOptions.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          Add source
        </Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Add source</SheetTitle>
          <SheetDescription>Paste a note, upload a doc, or add a URL — it&rsquo;s parsed into signals.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <Tabs defaultValue="note">
            <TabsList>
              <TabsTrigger value="note">
                <StickyNote className="mr-1.5 h-3.5 w-3.5" />
                Note
              </TabsTrigger>
              <TabsTrigger value="link">
                <Link2 className="mr-1.5 h-3.5 w-3.5" />
                Link
              </TabsTrigger>
              <TabsTrigger value="file">
                <FileUp className="mr-1.5 h-3.5 w-3.5" />
                File
              </TabsTrigger>
            </TabsList>

            <TabsContent value="note" className="mt-4 space-y-3">
              <Input
                placeholder="Title (e.g. Sprint retro notes)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                placeholder="Paste meeting notes, an email thread, a decision doc…"
                rows={7}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              {engineTeamFields()}
              <Button onClick={submitNote} disabled={busy || !title.trim() || content.trim().length < 40}>
                {busy ? 'Ingesting…' : 'Ingest'}
              </Button>
            </TabsContent>

            <TabsContent value="link" className="mt-4 space-y-3">
              <Input
                placeholder="https:// — Notion, Google Docs/Sheets, or any page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
              {engineTeamFields()}
              <Button onClick={submitUrl} disabled={busy || !url.trim()}>
                {busy ? 'Fetching…' : 'Ingest link'}
              </Button>
            </TabsContent>

            <TabsContent value="file" className="mt-4 space-y-3">
              {engineTeamFields()}
              <Input
                ref={fileInput}
                type="file"
                accept=".pdf,.docx,.xlsx,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void submitFile(file)
                }}
              />
              <p className="text-xs text-muted-foreground">PDF, Word, Excel, or CSV — up to 10MB.</p>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
