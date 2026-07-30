'use client'

import { useCallback, useRef, useState } from 'react'
import { Bold, Code, Italic, Link2, List, Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MarkdownBody } from './markdown-body'

export interface UploadedAttachment {
  id: string
  filename: string
  contentType: string
  size: number
  url: string
}

const MAX_UPLOAD_MB = 8

/** Markdown for an upload: images embed inline, everything else becomes a link. */
function embedFor(attachment: UploadedAttachment): string {
  return attachment.contentType.startsWith('image/')
    ? `![${attachment.filename}](${attachment.url})`
    : `[${attachment.filename}](${attachment.url})`
}

/**
 * Markdown editor used for both the description and comments.
 *
 * The reason this exists: people describe bugs with screenshots. Pasting an
 * image (Ctrl+V), dropping a file, or picking one from the toolbar uploads it
 * and splices the markdown embed in at the caret, so a screenshot lands inline
 * in the prose instead of being an afterthought in a separate list.
 */
export function MarkdownComposer({
  value,
  onChange,
  workItemId,
  placeholder = 'Write a description… Markdown supported. Paste or drop images to embed them.',
  minHeight = 160,
  autoFocus = false,
  disabled = false,
  onUploaded,
  footer,
}: {
  value: string
  onChange: (value: string) => void
  workItemId: string
  placeholder?: string
  minHeight?: number
  autoFocus?: boolean
  disabled?: boolean
  onUploaded?: (attachment: UploadedAttachment) => void
  /** Action row rendered under the editor (Save/Cancel, Comment…). */
  footer?: React.ReactNode
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(0)

  // Always splice against the freshest value: several uploads can land while
  // the user keeps typing, and reading `value` from the closure would drop
  // whatever was typed in between.
  const valueRef = useRef(value)
  valueRef.current = value

  const insertAtCaret = useCallback(
    (snippet: string) => {
      const textarea = textareaRef.current
      const current = valueRef.current
      const start = textarea?.selectionStart ?? current.length
      const end = textarea?.selectionEnd ?? current.length
      const before = current.slice(0, start)
      const after = current.slice(end)
      const prefix = before && !before.endsWith('\n') ? '\n' : ''
      const suffix = after && !after.startsWith('\n') ? '\n' : ''
      const next = `${before}${prefix}${snippet}${suffix}${after}`
      valueRef.current = next
      onChange(next)
      const caret = (before + prefix + snippet).length
      requestAnimationFrame(() => {
        textarea?.focus()
        textarea?.setSelectionRange(caret, caret)
      })
    },
    [onChange],
  )

  const wrapSelection = useCallback(
    (left: string, right: string = left, fallback = 'text') => {
      const textarea = textareaRef.current
      const current = valueRef.current
      const start = textarea?.selectionStart ?? current.length
      const end = textarea?.selectionEnd ?? current.length
      const selected = current.slice(start, end) || fallback
      const next = `${current.slice(0, start)}${left}${selected}${right}${current.slice(end)}`
      valueRef.current = next
      onChange(next)
      requestAnimationFrame(() => {
        textarea?.focus()
        textarea?.setSelectionRange(start + left.length, start + left.length + selected.length)
      })
    },
    [onChange],
  )

  const replaceToken = useCallback(
    (token: string, replacement: string) => {
      const next = valueRef.current.replace(token, replacement)
      valueRef.current = next
      onChange(next)
    },
    [onChange],
  )

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      for (const file of files) {
        if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
          toast.error(`${file.name} is larger than ${MAX_UPLOAD_MB}MB`)
          continue
        }

        // A visible placeholder keeps the caret position meaningful while the
        // bytes are in flight, and marks exactly where the image will land.
        const token = `![uploading ${file.name}…]()`
        insertAtCaret(token)
        setUploading((n) => n + 1)

        try {
          const form = new FormData()
          form.append('file', file)
          const res = await fetch(`/api/work-items/${workItemId}/attachments`, { method: 'POST', body: form })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            replaceToken(token, '')
            toast.error(data.error ?? `Failed to upload ${file.name}`)
            continue
          }
          replaceToken(token, embedFor(data.attachment))
          onUploaded?.(data.attachment)
        } catch {
          replaceToken(token, '')
          toast.error(`Failed to upload ${file.name}`)
        } finally {
          setUploading((n) => n - 1)
        }
      }
    },
    [insertAtCaret, onUploaded, replaceToken, workItemId],
  )

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files)
    // Only hijack the paste when it actually carries files — a normal text
    // paste must keep its native behaviour (and its undo history).
    if (files.length === 0) return
    event.preventDefault()
    uploadFiles(files)
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) uploadFiles(files)
  }

  const busy = disabled || uploading > 0

  return (
    <div className="rounded-lg border bg-card shadow-xs">
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton label="Bold" onClick={() => wrapSelection('**')} disabled={disabled}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => wrapSelection('_')} disabled={disabled}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Code" onClick={() => wrapSelection('`', '`', 'code')} disabled={disabled}>
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Link" onClick={() => wrapSelection('[', '](https://)', 'label')} disabled={disabled}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Bulleted list" onClick={() => insertAtCaret('- ')} disabled={disabled}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>

        <span className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton label="Attach a file" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
          <Paperclip className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-1">
          {uploading > 0 && (
            <span className="mr-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Uploading…
            </span>
          )}
          <TabButton active={tab === 'write'} onClick={() => setTab('write')}>
            Write
          </TabButton>
          <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>
            Preview
          </TabButton>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          uploadFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />

      {tab === 'write' ? (
        <div
          className={cn('relative', dragging && 'ring-2 ring-inset ring-beacon/50')}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            placeholder={placeholder}
            autoFocus={autoFocus}
            disabled={disabled}
            style={{ minHeight }}
            className="w-full resize-y bg-transparent px-3.5 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:opacity-50"
          />
          {dragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-beacon/[0.06] text-xs font-medium text-beacon">
              Drop to attach
            </div>
          )}
        </div>
      ) : (
        <div className="px-3.5 py-3" style={{ minHeight }}>
          {value.trim() ? (
            <MarkdownBody>{value}</MarkdownBody>
          ) : (
            <p className="text-sm text-muted-foreground/70">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
        <p className="mr-auto text-[11px] text-muted-foreground/80">
          Markdown supported · paste or drop a screenshot to embed it
        </p>
        {footer}
      </div>

      {/* Consumers disable their own submit while uploads are in flight. */}
      <span className="sr-only" aria-live="polite">
        {busy ? 'Upload in progress' : ''}
      </span>
    </div>
  )
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
    >
      {children}
    </Button>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-2 py-1 text-[11px] font-medium transition-colors',
        active ? 'bg-beacon/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
