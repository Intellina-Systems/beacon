export interface GitReference {
  key: string
  closing: boolean
}

const CLOSING_KEYWORDS = [
  'close',
  'closes',
  'closed',
  'closing',
  'fix',
  'fixes',
  'fixed',
  'fixing',
  'resolve',
  'resolves',
  'resolved',
  'resolving',
  'complete',
  'completes',
  'completed',
  'completing',
]

const BARE_KEY = '[A-Z][A-Z0-9]{1,9}-\\d+'
const KEY_PATTERN = new RegExp(`\\b(${BARE_KEY})\\b`, 'g')
// "Fixes BEA-1, BEA-2 and closes BEA-3" / "fix: BEA-4" — keyword, then one or
// more keys chained by commas/"and"/"&".
const CLOSING_PATTERN = new RegExp(
  `\\b(?:${CLOSING_KEYWORDS.join('|')})\\b[\\s:]*((?:${BARE_KEY}[\\s,&]*(?:and\\s+)?)+)`,
  'gi',
)

// Finds every work-item key mentioned in free text (PR title/body), and marks
// which ones are preceded by a closing keyword — the convention (shared by
// Linear and GitHub) that distinguishes "this PR completes that item" from a
// plain reference that should only link, never transition status.
export function parseGitReferences(text: string | null | undefined): GitReference[] {
  if (!text) return []

  const allKeys = new Set<string>()
  for (const m of text.matchAll(KEY_PATTERN)) allKeys.add(m[1].toUpperCase())
  if (allKeys.size === 0) return []

  const closingKeys = new Set<string>()
  for (const m of text.matchAll(CLOSING_PATTERN)) {
    for (const km of m[1].toUpperCase().matchAll(new RegExp(BARE_KEY, 'g'))) closingKeys.add(km[0])
  }

  return Array.from(allKeys).map((key) => ({ key, closing: closingKeys.has(key) }))
}
