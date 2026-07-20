'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ProjectHealth } from '@/lib/db/schema'

const HEALTH_LABEL: Record<ProjectHealth, string> = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' }

export function PostUpdateDialog({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [health, setHealth] = useState<ProjectHealth>('on_track')
  const [body, setBody] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)

  async function draftWithAI() {
    setDrafting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/updates/draft`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setHealth(data.draft.health)
        setBody(data.draft.body)
      } else {
        toast.error('Failed to draft update')
      }
    } finally {
      setDrafting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ health, body: body.trim() }),
      })
      if (res.ok) {
        toast.success('Update posted')
        setOpen(false)
        setBody('')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to post update')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Post update
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Post a project update</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Health</Label>
              <Select value={health} onValueChange={(v) => setHealth(v as ProjectHealth)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(HEALTH_LABEL) as ProjectHealth[]).map((h) => (
                    <SelectItem key={h} value={h}>
                      {HEALTH_LABEL[h]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="update-body">Update</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  disabled={drafting}
                  onClick={draftWithAI}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {drafting ? 'Drafting…' : 'Draft with AI'}
                </Button>
              </div>
              <Textarea
                id="update-body"
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What shipped, what changed, what to watch…"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !body.trim()}>
                {saving ? 'Posting…' : 'Post update'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
