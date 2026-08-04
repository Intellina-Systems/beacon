'use client'

import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { FolderKanban, ListPlus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { ResolvedTask } from '@/lib/work-items/bulk-import'
import type { docSchema } from '../doc-schema'

type DocEditorInstance = typeof docSchema.BlockNoteEditor

export interface TaskProposalOptions {
  members: { id: string; name: string }[]
  projects: { id: string; name: string }[]
}

async function runSummarize(editor: DocEditorInstance, docId: string) {
  const placeholder = insertOrUpdateBlockForSlashMenu(editor, { type: 'paragraph', content: 'Summarizing…' })
  const res = await fetch(`/api/docs/${docId}/summarize`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    editor.updateBlock(placeholder, { type: 'paragraph', content: data.error ?? 'Failed to summarize document.' })
    toast.error(data.error ?? 'Failed to summarize document')
    return
  }
  editor.updateBlock(placeholder, { type: 'quote', content: data.summary as string })
}

async function runGenerateTasks(
  docId: string,
  onExtracted: (tasks: ResolvedTask[], options: TaskProposalOptions) => void,
) {
  const toastId = toast.loading('Extracting tasks from this document…')
  try {
    const res = await fetch(`/api/docs/${docId}/generate-tasks`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error ?? 'Failed to extract tasks')
      return
    }
    onExtracted(data.tasks as ResolvedTask[], data.options as TaskProposalOptions)
  } finally {
    toast.dismiss(toastId)
  }
}

export function getAiSlashMenuItems(
  editor: DocEditorInstance,
  docId: string,
  callbacks: {
    onTasksExtracted: (tasks: ResolvedTask[], options: TaskProposalOptions) => void
    onPickProject: () => void
  },
): DefaultReactSuggestionItem[] {
  return [
    {
      title: 'Summarize',
      subtext: 'Insert an AI summary of this document',
      aliases: ['summarize', 'summary', 'tldr'],
      group: 'AI',
      icon: <Sparkles className="h-4 w-4" />,
      onItemClick: () => {
        void runSummarize(editor, docId)
      },
    },
    {
      title: 'Generate tasks',
      subtext: 'Extract tasks from this document — review before creating',
      aliases: ['generate-tasks', 'tasks', 'extract'],
      group: 'AI',
      icon: <ListPlus className="h-4 w-4" />,
      onItemClick: () => {
        void runGenerateTasks(docId, callbacks.onTasksExtracted)
      },
    },
    {
      title: 'Project status',
      subtext: 'Insert a status snapshot for a project',
      aliases: ['project-status', 'status', 'project'],
      group: 'AI',
      icon: <FolderKanban className="h-4 w-4" />,
      onItemClick: callbacks.onPickProject,
    },
  ]
}
