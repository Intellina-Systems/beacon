import { ExternalLink, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
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
import { KIND_LABEL } from '@/lib/work-items/constants'
import type { ItemDetail } from '@/lib/work-items/types'

export function WorkItemHeader({ item, onDelete }: { item: ItemDetail; onDelete: () => void }) {
  return (
    <DrawerHeader className="shrink-0 space-y-0 border-b px-6 py-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {item.key && <span className="font-mono text-xs text-muted-foreground">{item.key}</span>}
          <Badge variant="secondary" className="px-1.5 py-0 font-mono text-[10px] uppercase">
            {KIND_LABEL[item.kind]}
          </Badge>
          {item.externalUrl && (
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              title="Open in tracker"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
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
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <DrawerTitle className="sr-only">{item.title}</DrawerTitle>
    </DrawerHeader>
  )
}
