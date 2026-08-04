'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { STATUS_META } from '@/lib/work-items/constants'
import type { WorkItemStatus } from '@/lib/db/schema'
import type { docSchema } from './doc-schema'

type DocEditorInstance = typeof docSchema.BlockNoteEditor

interface ProjectOption {
  id: string
  name: string
}

interface ActivityResponse {
  activity: {
    statusCounts: Record<string, number>
    totalItems: number
    recentEvents: { summary: string }[]
  }
}

// Deliberately the cheap half only (gatherProjectActivity: DB-only status
// counts + recent event count, no LLM) — the narrative/health-verdict half
// (draftProjectUpdate) stays a separate, slower, explicitly-invoked action on
// the project page itself, not something a slash command fires on every insert.
export function ProjectStatusDialog({
  editor,
  open,
  onClose,
}: {
  editor: DocEditorInstance
  open: boolean
  onClose: () => void
}) {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null)
  const [inserting, setInserting] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setProjects(null)
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => setProjects((data.projects ?? []).map((p: ProjectOption) => ({ id: p.id, name: p.name }))))
      .catch(() => setProjects([]))
  }, [open])

  async function insertStatus(project: ProjectOption) {
    setInserting(project.id)
    try {
      const res = await fetch(`/api/projects/${project.id}/activity`)
      const data = (await res.json().catch(() => ({}))) as ActivityResponse & { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to load project activity')
        return
      }
      const { statusCounts, totalItems, recentEvents } = data.activity
      const statusLine = Object.entries(statusCounts)
        .map(([status, n]) => `${STATUS_META[status as WorkItemStatus]?.label ?? status}: ${n}`)
        .join(' · ')

      const blocks: (typeof docSchema.PartialBlock)[] = [
        { type: 'heading', props: { level: 3 }, content: `${project.name} — status` },
        {
          type: 'paragraph',
          content: totalItems > 0 ? `${totalItems} work items · ${statusLine}` : 'No work items yet.',
        },
        {
          type: 'paragraph',
          content: `${recentEvents.length} update${recentEvents.length === 1 ? '' : 's'} in the last 7 days.`,
        },
      ]
      const trailing = editor.document[editor.document.length - 1]
      editor.insertBlocks(blocks, trailing, 'after')
      onClose()
    } finally {
      setInserting(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Insert project status</DialogTitle>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {projects === null ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">No projects yet.</p>
          ) : (
            projects.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="ghost"
                disabled={inserting !== null}
                onClick={() => insertStatus(p)}
                className="h-auto w-full justify-start px-2 py-2 text-left text-sm font-normal"
              >
                {inserting === p.id ? 'Inserting…' : p.name}
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
