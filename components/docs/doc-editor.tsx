'use client'

import '@blocknote/shadcn/style.css'
import './doc-typography.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LinkToolbarController,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from '@blocknote/react'
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
import { LAST_DOC_COOKIE } from '@/lib/docs/last-doc-cookie'
import { docSchema } from './doc-schema'
import { MentionMenus } from './mention-menus'
import { DocExportMenu } from './doc-export-menu'
import { DocPresence } from './doc-presence'
import { getBeaconSlashMenuItems } from './slash-commands/beacon-items'
import { getTemplateSlashMenuItems } from './slash-commands/templates'
import { getDiagramSlashMenuItems } from './slash-commands/diagram-item'
import { getAiSlashMenuItems, type TaskProposalOptions } from './slash-commands/ai-items'
import { GenerateTasksDialog } from './generate-tasks-dialog'
import { ProjectStatusDialog } from './project-status-dialog'
import { openDocLink } from './open-doc-link'
import { DocLinkToolbar } from './doc-link-toolbar'
import type { ResolvedTask } from '@/lib/work-items/bulk-import'

// Shortened from 1200ms — the debounce itself isn't the main thing that made
// saving feel laggy (see the 'pending' state below for the bigger fix), but
// a snappier window still means less time before a save is actually inflight.
const AUTOSAVE_DELAY_MS = 500

// 'pending' fills the gap the old two-state (saving/saved) flow left silent:
// the moment a keystroke lands, state flips to 'pending' *synchronously* —
// before the debounce timer even starts — so the UI never looks idle while
// a change is waiting to be saved. 'saving' only covers the actual in-flight
// request, which is normally too brief to read anyway.
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

async function patchDoc(docId: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/docs/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

export function DocEditor({ doc, editable }: { doc: Doc; editable: boolean }) {
  const router = useRouter()
  const [title, setTitle] = useState(doc.title)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [taskProposals, setTaskProposals] = useState<{ tasks: ResolvedTask[]; options: TaskProposalOptions } | null>(
    null,
  )
  const [pickingProject, setPickingProject] = useState(false)

  const editor = useCreateBlockNote({
    schema: docSchema,
    dropCursor: multiColumnDropCursor,
    // The column blocks carry their own dictionary; without merging it in,
    // getMultiColumnSlashMenuItems throws when the slash menu opens.
    dictionary: { ...en, multi_column: multiColumnLocales.en },
    initialContent: doc.content.length > 0 ? (doc.content as (typeof docSchema.PartialBlock)[]) : undefined,
    links: {
      // BlockNote's default link behavior is always `window.open(href, '_blank')`
      // — right for an external URL, wrong for a link to another Beacon doc
      // (or a work item), which should navigate in place like the rest of
      // the app. Ctrl/Cmd-click still forces a new tab, matching normal
      // browser link behavior. The link-hover toolbar's own "open" button is
      // a separate code path — see DocLinkToolbar.
      onClick: (event) => {
        const href = (event.target as HTMLElement).closest('a')?.getAttribute('href')
        if (!href) return false
        event.preventDefault()
        openDocLink(href, router, { newTab: event.metaKey || event.ctrlKey })
        return true
      },
    },
  })

  // The column items ship under BlockNote's own "Basic blocks" group, so
  // appending them leaves that group split across two non-contiguous runs and
  // the menu renders two headers with the same key. Giving them their own
  // group keeps every group contiguous, and reads better besides.
  const slashMenuItems = useMemo(
    () => [
      ...getDefaultReactSlashMenuItems(editor),
      ...getMultiColumnSlashMenuItems(editor).map((item) => ({ ...item, group: 'Columns' })),
      ...getBeaconSlashMenuItems(editor, doc.id),
      ...getTemplateSlashMenuItems(editor),
      ...getDiagramSlashMenuItems(editor),
      ...getAiSlashMenuItems(editor, doc.id, {
        onTasksExtracted: (tasks, options) => setTaskProposals({ tasks, options }),
        onPickProject: () => setPickingProject(true),
      }),
    ],
    [editor, doc.id],
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
    // No Max-Age → a session cookie, so app/docs/page.tsx only resumes into
    // this doc for the rest of this browser session, never indefinitely.
    document.cookie = `${LAST_DOC_COOKIE}=${doc.id}; path=/; SameSite=Lax`
  }, [doc.id])

  useEffect(() => {
    if (!editable) return
    const unsubscribe = editor.onChange((_editor, { getChanges }) => {
      if (getChanges().length === 0) return
      setSaveState('pending')
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
    setSaveState('pending')
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      if (value.trim()) void save({ title: value.trim() })
    }, AUTOSAVE_DELAY_MS)
  }

  const saveLabel =
    saveState === 'pending' || saveState === 'saving'
      ? 'Saving…'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'error'
          ? 'Failed to save'
          : ''

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-0">
      <div className="mb-1 flex shrink-0 items-center justify-end gap-3">
        <DocPresence docId={doc.id} />
        <span className="text-xs text-muted-foreground transition-opacity duration-200">{saveLabel}</span>
        <DocExportMenu editor={editor} title={title} />
      </div>
      <Input
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        disabled={!editable}
        placeholder="Untitled"
        // The shadcn Input base styles include `md:text-sm` and
        // `dark:bg-input/30` — both need an explicit override (not just the
        // unprefixed `text-*`/`bg-transparent`) because Tailwind keeps
        // differently-prefixed utilities for the same property side by side,
        // and the prefixed one wins the cascade on a desktop, dark-mode view.
        className="mb-6 h-auto w-full min-w-0 border-none bg-transparent px-0 py-0 text-4xl font-bold tracking-tight shadow-none focus-visible:ring-0 disabled:opacity-100 md:text-4xl dark:bg-transparent"
      />
      {!editable && <p className="mb-4 text-xs text-muted-foreground">You have view-only access to this document.</p>}
      <BlockNoteView editor={editor} editable={editable} slashMenu={false} linkToolbar={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems(slashMenuItems, query)}
        />
        <MentionMenus editor={editor} />
        <LinkToolbarController linkToolbar={DocLinkToolbar} />
      </BlockNoteView>
      <GenerateTasksDialog
        editor={editor}
        tasks={taskProposals?.tasks ?? null}
        options={taskProposals?.options ?? null}
        onClose={() => setTaskProposals(null)}
      />
      <ProjectStatusDialog editor={editor} open={pickingProject} onClose={() => setPickingProject(false)} />
    </div>
  )
}
