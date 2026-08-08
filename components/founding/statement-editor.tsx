'use client'

import { useCallback, useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'

// 'pending' fills the gap a plain saving/saved flow leaves silent: state
// flips synchronously on keystroke, before the debounce timer even starts,
// so the label never looks idle while a change is waiting to be saved. Same
// shape as components/docs/doc-editor.tsx's SaveState.
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DELAY_MS = 500

export function StatementEditor({
  field,
  initialContent,
  placeholder,
}: {
  field: 'vision' | 'mission'
  initialContent: string
  placeholder: string
}) {
  const [content, setContent] = useState(initialContent)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(
    async (value: string) => {
      setSaveState('saving')
      const res = await fetch(`/api/workspace/${field}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value }),
      })
      setSaveState(res.ok ? 'saved' : 'error')
    },
    [field],
  )

  function handleChange(value: string) {
    setContent(value)
    setSaveState('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(value), AUTOSAVE_DELAY_MS)
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
    <div className="mx-auto w-full max-w-2xl px-4 py-10 lg:px-0">
      <div className="mb-2 flex justify-end">
        <span className="text-xs text-muted-foreground transition-opacity duration-200">{saveLabel}</span>
      </div>
      <Textarea
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[50vh] resize-none border-none bg-transparent px-0 text-lg leading-relaxed shadow-none focus-visible:ring-0 md:text-lg dark:bg-transparent"
      />
    </div>
  )
}
