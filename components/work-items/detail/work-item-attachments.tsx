'use client'

import { useRef, useState } from 'react'
import { Download, FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/work-items/format'
import { cn } from '@/lib/utils'
import type { AttachmentEntry } from '@/lib/work-items/types'

/**
 * Every file ever attached to the item, including the screenshots embedded in
 * the description and comments — one place to find "that image from the bug
 * report" without scrolling the thread.
 */
export function WorkItemAttachments({
  workItemId,
  attachments,
  onChanged,
}: {
  workItemId: string
  attachments: AttachmentEntry[]
  onChanged: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function upload(files: File[]) {
    if (files.length === 0) return
    setUploading(true)
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch(`/api/work-items/${workItemId}/attachments`, { method: 'POST', body: form })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          toast.error(data.error ?? `Failed to upload ${file.name}`)
        }
      }
      onChanged()
    } finally {
      setUploading(false)
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' })
    if (res.ok) {
      onChanged()
    } else {
      toast.error('Failed to remove attachment')
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">
          Files
          {attachments.length > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground">{attachments.length}</span>
          )}
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 px-2 text-[11px]"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
          Upload
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          upload(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          upload(Array.from(e.dataTransfer.files))
        }}
        className={cn(
          'rounded-lg border border-dashed transition-colors',
          dragging && 'border-beacon/50 bg-beacon/[0.05]',
        )}
      >
        {attachments.length === 0 ? (
          <p className="px-3.5 py-5 text-center text-xs text-muted-foreground">
            No files yet — drop one here, or paste a screenshot into the description.
          </p>
        ) : (
          <ul className="divide-y">
            {attachments.map((file) => {
              const isImage = file.contentType.startsWith('image/')
              return (
                <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-3"
                    title={file.filename}
                  >
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element -- served from our own attachment API, not a static asset
                      <img
                        src={file.url}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded border bg-muted/40 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border bg-muted/40">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{file.filename}</span>
                      <span className="block text-[11px] text-muted-foreground">{formatBytes(file.size)}</span>
                    </span>
                  </a>
                  <a
                    href={file.url}
                    download={file.filename}
                    aria-label={`Download ${file.filename}`}
                    className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${file.filename}`}
                    className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(file.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
