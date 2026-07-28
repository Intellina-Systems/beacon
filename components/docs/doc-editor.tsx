'use client'

import '@blocknote/core/fonts/inter.css'
import '@blocknote/shadcn/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import { filterSuggestionItems } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import {
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
  multiColumnDropCursor,
} from '@blocknote/xl-multi-column'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import type { Doc } from '@/lib/db/schema'
import { docSchema } from './doc-schema'
import { MentionMenus } from './mention-menus'
import { DocExportMenu } from './doc-export-menu'

const AUTOSAVE_DELAY_MS = 1200

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

async function patchDoc(docId: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/docs/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

export function DocEditor({ doc, editable }: { doc: Doc; editable: boolean }) {
  const [title, setTitle] = useState(doc.title)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editor = useCreateBlockNote({
    schema: docSchema,
    dropCursor: multiColumnDropCursor,
    // The column blocks carry their own dictionary; without merging it in,
    // getMultiColumnSlashMenuItems throws when the slash menu opens.
    dictionary: { ...en, multi_column: multiColumnLocales.en },
    initialContent: doc.content.length > 0 ? (doc.content as (typeof docSchema.PartialBlock)[]) : undefined,
  })

  // The column items ship under BlockNote's own "Basic blocks" group, so
  // appending them leaves that group split across two non-contiguous runs and
  // the menu renders two headers with the same key. Giving them their own
  // group keeps every group contiguous, and reads better besides.
  const slashMenuItems = useMemo(
    () => [
      ...getDefaultReactSlashMenuItems(editor),
      ...getMultiColumnSlashMenuItems(editor).map((item) => ({ ...item, group: 'Columns' })),
    ],
    [editor],
  )

  const save = useCallback(
    async (body: Record<string, unknown>) => {
      setSaveState('saving')
      const ok = await patchDoc(doc.id, body)
      if (ok) {
        setSaveState('saved')
      } else {
        setSaveState('error')
        toast.error('Failed to save document')
      }
    },
    [doc.id],
  )

  useEffect(() => {
    if (!editable) return
    const unsubscribe = editor.onChange((_editor, { getChanges }) => {
      if (getChanges().length === 0) return
      if (contentTimer.current) clearTimeout(contentTimer.current)
      contentTimer.current = setTimeout(() => {
        void save({ content: editor.document })
      }, AUTOSAVE_DELAY_MS)
    })
    return () => {
      unsubscribe?.()
      if (contentTimer.current) clearTimeout(contentTimer.current)
    }
  }, [editor, editable, save])

  function handleTitleChange(value: string) {
    setTitle(value)
    if (!editable) return
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      if (value.trim()) void save({ title: value.trim() })
    }, AUTOSAVE_DELAY_MS)
  }

  const saveLabel =
    saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Failed to save' : ''

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-0">
      <div className="mb-2 flex items-start justify-between gap-3">
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          disabled={!editable}
          placeholder="Untitled"
          className="h-auto border-none bg-transparent px-0 text-3xl font-bold tracking-tight shadow-none focus-visible:ring-0 disabled:opacity-100"
        />
        <div className="mt-2 flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground transition-opacity duration-200">{saveLabel}</span>
          <DocExportMenu editor={editor} title={title} />
        </div>
      </div>
      {!editable && <p className="mb-4 text-xs text-muted-foreground">You have view-only access to this document.</p>}
      <BlockNoteView editor={editor} editable={editable} slashMenu={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems(slashMenuItems, query)}
        />
        <MentionMenus editor={editor} />
      </BlockNoteView>
    </div>
  )
}
