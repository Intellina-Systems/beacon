'use client'

import { insertOrUpdateBlockForSlashMenu, SuggestionMenu } from '@blocknote/core'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { AtSign, FileStack, Hash, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import type { docSchema } from '../doc-schema'

type DocEditorInstance = typeof docSchema.BlockNoteEditor

// /workitem and /person don't run their own search — they hand off to the
// existing #/@ menus (mention-menus.tsx), the exact trick BlockNote's own
// built-in /emoji slash item uses to hand off to `:` (getDefaultSlashMenuItems.ts).
// That way there's still exactly one place that knows how to search each
// kind of mention, not a second copy living in the slash menu.
function handOffTo(editor: DocEditorInstance, triggerCharacter: string) {
  editor.getExtension(SuggestionMenu)?.openSuggestionMenu(triggerCharacter, {
    deleteTriggerCharacter: true,
    ignoreQueryLength: true,
  })
}

async function createSubPage(editor: DocEditorInstance, parentId: string) {
  const res = await fetch('/api/docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId }),
  })
  if (!res.ok) {
    toast.error('Failed to create sub-page')
    return
  }
  const { doc } = (await res.json()) as { doc: { id: string; title: string } }
  editor.insertInlineContent([{ type: 'link', href: `/docs/${doc.id}`, content: doc.title || 'Untitled' }, ' '])
  // Stays on the current page (matching Notion's inline-page-link behavior,
  // not a full navigate-away) — the doc header's own "New sub-page" button
  // covers the navigate-away case. The sidebar tree only refetches on
  // pathname change or window focus, neither of which fires here.
  window.dispatchEvent(new Event('beacon:docs-changed'))
}

export function getBeaconSlashMenuItems(editor: DocEditorInstance, docId: string): DefaultReactSuggestionItem[] {
  return [
    {
      title: 'Work item',
      subtext: 'Link an existing work item',
      aliases: ['workitem', 'issue', 'ticket'],
      group: 'Beacon',
      icon: <Hash className="h-4 w-4" />,
      onItemClick: () => handOffTo(editor, '#'),
    },
    {
      title: 'Person',
      subtext: 'Mention a teammate',
      aliases: ['person', 'mention', 'member'],
      group: 'Beacon',
      icon: <AtSign className="h-4 w-4" />,
      onItemClick: () => handOffTo(editor, '@'),
    },
    {
      title: 'Task',
      subtext: 'Checklist item linked to a work item',
      aliases: ['task', 'todo', 'checklist'],
      group: 'Beacon',
      icon: <ListChecks className="h-4 w-4" />,
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: 'checkListItem' })
        handOffTo(editor, '#')
      },
    },
    {
      title: 'Sub-page',
      subtext: 'Create a nested page and link it here',
      aliases: ['subpage', 'page', 'nested'],
      group: 'Beacon',
      icon: <FileStack className="h-4 w-4" />,
      onItemClick: () => {
        void createSubPage(editor, docId)
      },
    },
  ]
}
