'use client'

import { Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface PRFiltersProps {
  authors: string[]
}

function PRFiltersInner({ authors }: PRFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('prPage')
    router.push(`${pathname}?${params.toString()}`)
  }

  const currentState = searchParams.get('prState') ?? 'all'
  const currentAuthor = searchParams.get('prAuthor') ?? 'all'

  return (
    <div className="flex flex-wrap gap-2 pb-3">
      <Select value={currentState} onValueChange={(v) => update('prState', v)}>
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue placeholder="State" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All states</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>

      {authors.length > 0 && (
        <Select value={currentAuthor} onValueChange={(v) => update('prAuthor', v)}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder="Author" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All authors</SelectItem>
            {authors.map((author) => (
              <SelectItem key={author} value={author}>
                {author}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

export function PRFilters(props: PRFiltersProps) {
  return (
    <Suspense>
      <PRFiltersInner {...props} />
    </Suspense>
  )
}

interface CommitFiltersProps {
  authors: string[]
  range: string
}

const COMMIT_RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last year' },
]

function CommitFiltersInner({ authors, range }: CommitFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('commitPage')
    router.push(`${pathname}?${params.toString()}`)
  }

  const currentAuthor = searchParams.get('commitAuthor') ?? 'all'
  const currentRange = COMMIT_RANGE_OPTIONS.some((option) => option.value === range) ? range : '90'

  return (
    <div className="flex flex-wrap gap-2 pb-3">
      <Select value={currentRange} onValueChange={(v) => update('commitRange', v)}>
        <SelectTrigger className="h-7 w-36 text-xs">
          <SelectValue placeholder="Range" />
        </SelectTrigger>
        <SelectContent>
          {COMMIT_RANGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {authors.length > 0 && (
        <Select value={currentAuthor} onValueChange={(v) => update('commitAuthor', v)}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder="Author" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All authors</SelectItem>
            {authors.map((author) => (
              <SelectItem key={author} value={author}>
                {author}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

export function CommitFilters(props: CommitFiltersProps) {
  return (
    <Suspense>
      <CommitFiltersInner {...props} />
    </Suspense>
  )
}
