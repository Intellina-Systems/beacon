'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { DocSearchResult } from '@/app/api/docs/search/route'

const DEBOUNCE_MS = 200
const MIN_QUERY_LENGTH = 2

// Cmd+K / Ctrl+K anywhere in the docs section — quick-open by title or
// content, backed by /api/docs/search (Phase 5's sync into knowledgeDocuments
// is what makes content matching possible). Composed manually rather than
// via the shadcn CommandDialog wrapper, which doesn't forward shouldFilter —
// needed here since results are already server-filtered; cmdk's own default
// client-side filter would otherwise re-filter by comparing the typed query
// against each CommandItem's `value` (the doc id), silently dropping every
// real match.
export function DocsCommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DocSearchResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    // Render already gates on the same length check before showing results,
    // so a too-short query just skips fetching — no need to clear stale
    // `results` here (that would be a setState synchronously inside an
    // effect body, which cascading-renders for no benefit; it's simply never
    // read while this branch is active).
    if (trimmed.length < MIN_QUERY_LENGTH) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/docs/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => setResults(data.results ?? []))
        .catch(() => setResults([]))
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, query])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setQuery('')
      setResults([])
    }
  }

  function select(id: string) {
    handleOpenChange(false)
    router.push(`/docs/${id}`)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Jump to document</DialogTitle>
        <DialogDescription>Search documents by title or content</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search documents…" value={query} onValueChange={setQuery} />
          <CommandList>
            {query.trim().length < MIN_QUERY_LENGTH ? (
              <CommandEmpty>Type at least 2 characters…</CommandEmpty>
            ) : results.length === 0 ? (
              <CommandEmpty>No matching documents.</CommandEmpty>
            ) : (
              <CommandGroup heading="Documents">
                {results.map((r) => (
                  <CommandItem key={r.id} value={r.id} onSelect={() => select(r.id)}>
                    <FileText className="h-4 w-4" />
                    <span className="truncate">{r.title}</span>
                    {r.matchedIn === 'content' && (
                      <span className="ml-auto text-xs text-muted-foreground">in content</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
