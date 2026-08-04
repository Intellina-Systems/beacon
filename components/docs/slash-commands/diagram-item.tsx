'use client'

import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { Workflow } from 'lucide-react'
import type { docSchema } from '../doc-schema'

type DocEditorInstance = typeof docSchema.BlockNoteEditor

export function getDiagramSlashMenuItems(editor: DocEditorInstance): DefaultReactSuggestionItem[] {
  return [
    {
      title: 'Diagram',
      subtext: 'Mermaid flowchart, sequence, or other diagram',
      aliases: ['diagram', 'mermaid', 'flowchart', 'chart'],
      group: 'Beacon',
      icon: <Workflow className="h-4 w-4" />,
      // No explicit props: propSchema's own default (a small starter
      // flowchart) fills in — see blocks/mermaid-block.tsx.
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'mermaidDiagram' }),
    },
  ]
}
