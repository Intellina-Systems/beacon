'use client'

import { useCallback, useSyncExternalStore } from 'react'

export interface WorkItemSnapshot {
  key: string | null
  title: string
  status: string
}

/**
 * Work-item chips render a snapshot saved into the document, which goes stale
 * the moment someone moves the item. Each chip subscribes here for the live
 * value; ids requested in the same tick are coalesced into one network call so
 * a doc with forty chips still costs a single request, not forty.
 */
const cache = new Map<string, WorkItemSnapshot>()
const subscribers = new Map<string, Set<() => void>>()
let pending = new Set<string>()
let flushHandle: ReturnType<typeof setTimeout> | null = null

async function flush() {
  flushHandle = null
  const ids = [...pending]
  pending = new Set()
  if (ids.length === 0) return

  try {
    const res = await fetch(`/api/docs/mentions/status?ids=${ids.map(encodeURIComponent).join(',')}`)
    if (!res.ok) return
    const { statuses } = (await res.json()) as { statuses: Record<string, WorkItemSnapshot> }
    for (const [id, snapshot] of Object.entries(statuses)) {
      cache.set(id, snapshot)
      subscribers.get(id)?.forEach((notify) => notify())
    }
  } catch {
    // A failed refresh is not worth surfacing — the chip keeps showing the
    // snapshot stored in the document.
  }
}

function request(id: string) {
  pending.add(id)
  if (flushHandle === null) flushHandle = setTimeout(flush, 0)
}

/**
 * Returns the freshest known snapshot for a work item, falling back to the one
 * embedded in the document until the batched lookup resolves.
 *
 * Modelled as an external store rather than fetch-into-state so subscribing
 * never triggers a second render pass, and so every chip pointing at the same
 * item shares one cache entry.
 */
export function useWorkItemSnapshot(id: string, fallback: WorkItemSnapshot): WorkItemSnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!id) return () => {}

      let listeners = subscribers.get(id)
      if (!listeners) {
        listeners = new Set()
        subscribers.set(id, listeners)
      }
      listeners.add(onStoreChange)
      request(id)

      return () => {
        listeners.delete(onStoreChange)
        if (listeners.size === 0) subscribers.delete(id)
      }
    },
    [id],
  )

  // Stable by reference until the batch writes a new object, so this is safe to
  // use as both the client and server snapshot.
  const getSnapshot = useCallback(() => cache.get(id), [id])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) ?? fallback
}
