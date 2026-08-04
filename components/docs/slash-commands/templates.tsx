'use client'

import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { CalendarCheck2, ClipboardList, Scale } from 'lucide-react'
import type { docSchema } from '../doc-schema'

type DocEditorInstance = typeof docSchema.BlockNoteEditor
type Blocks = (typeof docSchema.PartialBlock)[]

// Converts the current ("/") block into the template's first block, then
// inserts the rest after it — insertOrUpdateBlockForSlashMenu already
// handles the single-block replace-vs-insert-after judgment call for us.
function insertTemplate(editor: DocEditorInstance, [first, ...rest]: Blocks) {
  const inserted = insertOrUpdateBlockForSlashMenu(editor, first)
  if (rest.length > 0) editor.insertBlocks(rest, inserted, 'after')
}

const heading = (text: string): Blocks[number] => ({ type: 'heading', props: { level: 3 }, content: text })
const checklist = (text = ''): Blocks[number] => ({ type: 'checkListItem', content: text })
const paragraph = (text = ''): Blocks[number] => ({ type: 'paragraph', content: text })

const STANDUP: Blocks = [heading('Done'), paragraph(), heading('Doing'), paragraph(), heading('Blocked'), paragraph()]

const MEETING_NOTES: Blocks = [
  heading('Attendees'),
  paragraph(),
  heading('Agenda'),
  paragraph(),
  heading('Action items'),
  checklist(),
]

const DECISION: Blocks = [
  heading('Context'),
  paragraph(),
  heading('Decision'),
  paragraph(),
  heading('Consequences'),
  paragraph(),
]

export function getTemplateSlashMenuItems(editor: DocEditorInstance): DefaultReactSuggestionItem[] {
  return [
    {
      title: 'Standup',
      subtext: 'Done / Doing / Blocked',
      aliases: ['standup', 'daily'],
      group: 'Templates',
      icon: <ClipboardList className="h-4 w-4" />,
      onItemClick: () => insertTemplate(editor, STANDUP),
    },
    {
      title: 'Meeting notes',
      subtext: 'Attendees, agenda, action items',
      aliases: ['meeting', 'notes'],
      group: 'Templates',
      icon: <CalendarCheck2 className="h-4 w-4" />,
      onItemClick: () => insertTemplate(editor, MEETING_NOTES),
    },
    {
      title: 'Decision',
      subtext: 'Context, decision, consequences',
      aliases: ['decision', 'adr'],
      group: 'Templates',
      icon: <Scale className="h-4 w-4" />,
      onItemClick: () => insertTemplate(editor, DECISION),
    },
  ]
}
