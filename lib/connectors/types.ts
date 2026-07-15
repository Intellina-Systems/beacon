export interface SyncResult {
  events: number
  workItems: number
}

// Matches tracker keys like "BCN-42" / "AIRS-421" in commit messages, PR
// titles, and branch names so code activity lands on the right work item.
const WORK_ITEM_KEY_PATTERN = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/

export function extractWorkItemKey(...texts: (string | null | undefined)[]): string | undefined {
  for (const text of texts) {
    if (!text) continue
    const match = text.toUpperCase().match(WORK_ITEM_KEY_PATTERN)
    if (match) return match[1]
  }
  return undefined
}
