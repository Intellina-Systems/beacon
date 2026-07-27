'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { WorkItemStatus } from '@/lib/db/schema'

const HIDDEN_COLUMNS_STORAGE_KEY = 'beacon:work-board-hidden-columns'

// Triage is a separate queue (see /work?status=triage) and cancelled items
// are noise on a planning board — both are left off the columns.
export const BOARD_STATUSES: WorkItemStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done']

// First-time board view keeps the essentials in front — the rest are one
// click away via the Columns button — so someone new to the board isn't
// hit with six columns of clutter before they've had a chance to trim it.
const DEFAULT_VISIBLE_STATUSES: WorkItemStatus[] = ['todo', 'in_progress', 'done']

function readHiddenColumns(): Set<WorkItemStatus> {
  if (typeof window === 'undefined') return new Set()
  const raw = window.localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY)
  if (raw === null) {
    return new Set(BOARD_STATUSES.filter((s) => !DEFAULT_VISIBLE_STATUSES.includes(s)))
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((s): s is WorkItemStatus => BOARD_STATUSES.includes(s)))
  } catch {
    return new Set()
  }
}

interface BoardColumnsContextValue {
  hiddenColumns: Set<WorkItemStatus>
  toggleColumn: (status: WorkItemStatus) => void
}

const BoardColumnsContext = createContext<BoardColumnsContextValue | null>(null)

/**
 * Shares hidden-column state between the "Columns" button (in the filter row,
 * next to SavedViewsBar) and the board grid itself (rendered separately below
 * it) — a plain prop can't cross that gap since they're siblings, not parent
 * and child.
 */
export function BoardColumnsProvider({ children }: { children: ReactNode }) {
  const [hiddenColumns, setHiddenColumns] = useState<Set<WorkItemStatus>>(readHiddenColumns)

  function toggleColumn(status: WorkItemStatus) {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      window.localStorage.setItem(HIDDEN_COLUMNS_STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  return <BoardColumnsContext.Provider value={{ hiddenColumns, toggleColumn }}>{children}</BoardColumnsContext.Provider>
}

export function useBoardColumns() {
  const ctx = useContext(BoardColumnsContext)
  if (!ctx) throw new Error('useBoardColumns must be used within a BoardColumnsProvider')
  return ctx
}
