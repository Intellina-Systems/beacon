'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Check, ExternalLink, Link2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { KIND_LABEL, STATUS_META } from '@/lib/work-items/constants'
import { cn } from '@/lib/utils'
import type { ItemDetail } from '@/lib/work-items/types'

/** Sticky top bar of the work item page: where you are, and what you can do to it. */
export function WorkItemHeader({
  item,
  projectName,
  backHref,
  onDelete,
}: {
  item: ItemDetail
  projectName: string | null
  backHref: string
  onDelete: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard permission denied — the URL bar still has the link.
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur lg:px-6">
      <Button asChild size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0 text-muted-foreground">
        <Link href={backHref} aria-label="Back to work">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </Button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
        <Link href={backHref} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
          Work
        </Link>
        {projectName && (
          <>
            <span className="hidden shrink-0 text-muted-foreground/40 sm:inline">/</span>
            <span className="hidden shrink-0 text-muted-foreground sm:inline">{projectName}</span>
          </>
        )}
        <span className="shrink-0 text-muted-foreground/40">/</span>
        {item.key && <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.key}</span>}
        <Badge variant="secondary" className="shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase">
          {KIND_LABEL[item.kind]}
        </Badge>
      </nav>

      <span className="ml-2 hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex">
        <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_META[item.status].tone)} />
        {STATUS_META[item.status].label}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {item.externalUrl && (
          <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground">
            <a href={item.externalUrl} target="_blank" rel="noreferrer" title="Open in tracker">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={copyLink}
          title="Copy link"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this work item?</AlertDialogTitle>
              <AlertDialogDescription>
                Its comments and attachments go with it. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  )
}
