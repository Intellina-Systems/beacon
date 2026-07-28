'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * URL-driven like the other filters, but debounced since it fires on every
 * keystroke instead of a single select change.
 */
export function WorkSearchInput({ current, className }: { current: string | undefined; className?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(current ?? '')
  const [isPending, startTransition] = useTransition()
  // Last query we pushed to the URL — lets the sync-from-URL effect below
  // ignore its own round-trip landing, so a slow response can't stomp text
  // the user typed after the push but before the server replied.
  const pushedRef = useRef(current ?? '')

  useEffect(() => {
    if ((current ?? '') === pushedRef.current) return
    pushedRef.current = current ?? ''
    setValue(current ?? '')
  }, [current])

  useEffect(() => {
    const trimmed = value.trim()
    if (trimmed === (current ?? '')) return
    const handle = setTimeout(() => {
      pushedRef.current = trimmed
      const params = new URLSearchParams(searchParams.toString())
      if (trimmed) params.set('q', trimmed)
      else params.delete('q')
      params.delete('page')
      const qs = params.toString()
      // Transition keeps the current list on screen instead of falling back
      // to the route's loading.tsx skeleton on every keystroke.
      startTransition(() => {
        router.push(qs ? `/work?${qs}` : '/work', { scroll: false })
      })
    }, 300)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search work…"
        className="h-7 w-48 pl-7 pr-7 text-xs"
      />
      {isPending ? (
        <Loader2 className="absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        value && (
          <button
            type="button"
            onClick={() => setValue('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )
      )}
    </div>
  )
}
