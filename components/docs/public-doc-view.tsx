'use client'

import '@blocknote/core/fonts/inter.css'
import '@blocknote/shadcn/style.css'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import type { PartialBlock } from '@blocknote/core'

// Read-only, no fetches, no save path — there is no session backing this
// view, so nothing here should ever be able to write anything.
export function PublicDocView({ title, content }: { title: string; content: unknown[] }) {
  const editor = useCreateBlockNote({
    initialContent: content.length > 0 ? (content as PartialBlock[]) : undefined,
  })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-0">
      <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Shared via Beacon · view only
      </p>
      <h1 className="mb-4 text-3xl font-bold tracking-tight">{title || 'Untitled'}</h1>
      <BlockNoteView editor={editor} editable={false} />
    </div>
  )
}
