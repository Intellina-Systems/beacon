/**
 * Canonical URL for a work item's page. Prefers the human key ("BEA-11") so a
 * pasted link says what it points at; falls back to the id for items a
 * connector created without one.
 */
export function workItemHref(item: { id: string; key?: string | null }): string {
  return `/work/${encodeURIComponent(item.key ?? item.id)}`
}
