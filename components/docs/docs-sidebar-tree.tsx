'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronRight, FileText, MoreHorizontal, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
} from '@/components/ui/sidebar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { DocTreeNode } from '@/lib/docs/tree'
import { MoveDocDialog } from './move-doc-dialog'

async function fetchTree(): Promise<DocTreeNode[]> {
  const res = await fetch('/api/docs?tree=1')
  if (!res.ok) return []
  const data = await res.json()
  return data.tree ?? []
}

// Replaces the main nav while any /docs/* route is open — the sidebar
// becomes doc history/navigation the way Notion's does, rather than a
// separate page duplicating the same tree. Client-fetched (not server
// props) since this mounts once in the root layout, above any server data
// a /docs/[id] page could pass down.
export function DocsSidebarTree() {
  const pathname = usePathname()
  const router = useRouter()
  const [tree, setTree] = useState<DocTreeNode[] | null>(null)
  const [moving, setMoving] = useState<DocTreeNode | null>(null)

  const refresh = useCallback(() => {
    void fetchTree().then(setTree)
  }, [])

  useEffect(() => {
    refresh()
    // Re-fetch on every /docs navigation too — cheap, and catches a
    // sub-page or move made from elsewhere (e.g. the doc's own header).
  }, [refresh, pathname])

  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  // The /subpage slash command creates a doc without navigating to it (it
  // stays on the current page and inserts a link instead), so it can't rely
  // on the pathname-change effect above to pick up the new entry.
  useEffect(() => {
    window.addEventListener('beacon:docs-changed', refresh)
    return () => window.removeEventListener('beacon:docs-changed', refresh)
  }, [refresh])

  async function newTopLevelDoc() {
    const res = await fetch('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      const data = await res.json()
      router.push(`/docs/${data.doc.id}`)
      refresh()
    } else {
      toast.error('Failed to create document')
    }
  }

  return (
    <SidebarGroup className="p-0 py-2">
      <SidebarGroupLabel className="flex items-center justify-between px-2 text-sidebar-foreground/70">
        <span>Docs</span>
        <button
          type="button"
          onClick={newTopLevelDoc}
          title="New document"
          className="rounded p-0.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {tree === null ? (
            <li className="px-2 py-1.5 text-xs text-sidebar-foreground/60">Loading…</li>
          ) : tree.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-sidebar-foreground/60">No documents yet</li>
          ) : (
            tree.map((node) => (
              <SidebarDocNode key={node.id} node={node} pathname={pathname} onMove={setMoving} onChanged={refresh} />
            ))
          )}
        </SidebarMenu>
      </SidebarGroupContent>
      <MoveDocDialog
        doc={moving}
        tree={tree ?? []}
        open={moving !== null}
        onClose={() => setMoving(null)}
        onMoved={refresh}
      />
    </SidebarGroup>
  )
}

function SidebarDocNode({
  node,
  pathname,
  onMove,
  onChanged,
}: {
  node: DocTreeNode
  pathname: string
  onMove: (node: DocTreeNode) => void
  onChanged: () => void
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.children.length > 0
  const active = pathname === `/docs/${node.id}`

  async function newSubPage() {
    const res = await fetch('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: node.id }),
    })
    if (res.ok) {
      const data = await res.json()
      setExpanded(true)
      router.push(`/docs/${data.doc.id}`)
      onChanged()
    } else {
      toast.error('Failed to create sub-page')
    }
  }

  return (
    <SidebarMenuItem className="group/doc">
      <div
        className={cn(
          'relative flex items-center gap-0.5 rounded-md pr-6 text-sm text-sidebar-foreground',
          active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
        )}
      >
        <button
          type="button"
          onClick={hasChildren ? () => setExpanded((v) => !v) : undefined}
          aria-label={hasChildren ? (expanded ? 'Collapse' : 'Expand') : undefined}
          className={cn(
            'flex h-7 w-4 shrink-0 items-center justify-center text-sidebar-foreground/60 transition-transform',
            !hasChildren && 'invisible',
            expanded && 'rotate-90',
          )}
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <Link href={`/docs/${node.id}`} className="flex h-7 min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <FileText className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
          <span className="truncate">{node.title || 'Untitled'}</span>
        </Link>
        {node.permission === 'edit' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="More"
                className="absolute top-1 right-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 hover:bg-sidebar-accent group-hover/doc:opacity-100"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right">
              <DropdownMenuItem onClick={newSubPage}>New sub-page</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(node)}>Move to…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {hasChildren && expanded && (
        <SidebarMenuSub className="mx-0 border-sidebar-border py-0 pr-0 pl-3">
          {node.children.map((child) => (
            <SidebarDocNode key={child.id} node={child} pathname={pathname} onMove={onMove} onChanged={onChanged} />
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  )
}
