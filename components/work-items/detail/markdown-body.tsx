'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { cn } from '@/lib/utils'

const PROSE = [
  'text-sm leading-relaxed text-foreground/90',
  '[&_a]:text-beacon [&_a]:underline [&_a]:underline-offset-4',
  '[&_h1]:mt-5 [&_h1]:text-base [&_h1]:font-semibold',
  '[&_h2]:mt-5 [&_h2]:text-sm [&_h2]:font-semibold',
  '[&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-medium',
  '[&_p]:my-2 [&_li]:my-0.5',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_pre]:max-w-full [&_pre]:overflow-x-auto',
  '[&_table]:my-3 [&_table]:block [&_table]:overflow-x-auto',
  '[&_hr]:my-4',
  // Screenshots are the point of this view: give them room, a frame, and a
  // pointer so it reads as clickable.
  '[&_img]:my-3 [&_img]:max-h-[520px] [&_img]:cursor-zoom-in [&_img]:rounded-lg [&_img]:border [&_img]:bg-muted/30',
].join(' ')

/**
 * Markdown renderer for descriptions and comments. Clicking any inline image
 * opens it full-size — a pasted screenshot is usually too wide to read at the
 * column width, so the lightbox is what makes inline screenshots actually
 * useful rather than decorative.
 */
export function MarkdownBody({ children, className }: { children: string; className?: string }) {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.tagName !== 'IMG') return
    const image = target as HTMLImageElement
    if (!image.currentSrc && !image.src) return
    event.preventDefault()
    setLightbox({ src: image.currentSrc || image.src, alt: image.alt })
  }, [])

  useEffect(() => {
    if (!lightbox) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  return (
    <>
      {/* Click delegation: the rendered markdown is not ours to annotate, so the
          wrapper catches image clicks and opens the lightbox. */}
      <div onClick={handleClick} className={cn(PROSE, className)}>
        <Streamdown>{children}</Streamdown>
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt || 'Attachment preview'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close preview"
            className="absolute right-4 top-4 rounded-md border bg-card p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- attachment bytes are served from our own API, not an optimizable static asset */}
          <img
            src={lightbox.src}
            alt={lightbox.alt || 'Attachment preview'}
            className="max-h-full max-w-full rounded-lg border object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
