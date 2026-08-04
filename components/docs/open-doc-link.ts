'use client'

import type { useRouter } from 'next/navigation'

/**
 * Single place that decides same-tab (in-app) vs. new-tab navigation for a
 * link inside a doc. Two separate BlockNote code paths trigger a link open —
 * clicking the anchor directly, and the link-hover toolbar's "open" button —
 * both must funnel through here or one silently reverts to BlockNote's
 * default `window.open(..., '_blank')` for everything, internal doc links
 * included.
 */
export function openDocLink(href: string, router: ReturnType<typeof useRouter>, opts?: { newTab?: boolean }): void {
  if (href.startsWith('/') && !opts?.newTab) {
    router.push(href)
    return
  }
  window.open(href, '_blank', 'noopener,noreferrer')
}
