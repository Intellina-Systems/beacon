'use client'

import { useState } from 'react'
import { MessageSquare, Pencil, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
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
import { initialsOf } from '@/lib/work-items/format'
import type { CommentEntry } from '@/lib/work-items/types'
import { MarkdownBody } from './markdown-body'
import { MarkdownComposer } from './markdown-composer'

export function WorkItemComments({
  workItemId,
  comments,
  currentMemberId,
  canModerate,
  draft,
  onDraftChange,
  onPost,
  onEdit,
  onDelete,
  onUploaded,
  posting,
}: {
  workItemId: string
  comments: CommentEntry[]
  currentMemberId: string
  canModerate: boolean
  draft: string
  onDraftChange: (value: string) => void
  onPost: () => void
  onEdit: (commentId: string, body: string) => Promise<boolean>
  onDelete: (commentId: string) => void
  onUploaded?: () => void
  posting: boolean
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">
          Comments
          {comments.length > 0 && <span className="ml-1.5 font-normal text-muted-foreground">{comments.length}</span>}
        </h2>
      </div>

      {comments.length > 0 && (
        <div className="space-y-3">
          {comments.map((comment) => {
            const isAuthor = comment.authorMemberId === currentMemberId
            const isEditing = editingId === comment.id

            return (
              <article key={comment.id} className="rounded-lg border bg-card px-4 py-3 shadow-xs">
                <header className="flex items-center gap-2">
                  <Avatar className="h-6 w-6 border">
                    {comment.authorAvatarUrl && <AvatarImage src={comment.authorAvatarUrl} alt="" />}
                    <AvatarFallback className="text-[9px] font-medium">{initialsOf(comment.authorName)}</AvatarFallback>
                  </Avatar>
                  <span className="text-[13px] font-medium">{comment.authorName ?? 'Unknown'}</span>
                  <span className="text-[11px] text-muted-foreground">
                    <RelativeTime date={comment.createdAt} />
                    {comment.editedAt && ' · edited'}
                  </span>

                  {!isEditing && (isAuthor || canModerate) && (
                    <div className="ml-auto flex items-center gap-0.5">
                      {isAuthor && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Edit comment"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingId(comment.id)
                            setEditDraft(comment.body)
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Delete comment"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(comment.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </header>

                <div className="mt-2">
                  {isEditing ? (
                    <MarkdownComposer
                      value={editDraft}
                      onChange={setEditDraft}
                      workItemId={workItemId}
                      minHeight={120}
                      autoFocus
                      onUploaded={onUploaded}
                      placeholder="Edit your comment…"
                      footer={
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={!editDraft.trim()}
                            onClick={async () => {
                              if (await onEdit(comment.id, editDraft.trim())) setEditingId(null)
                            }}
                          >
                            Save
                          </Button>
                        </>
                      }
                    />
                  ) : (
                    <MarkdownBody>{comment.body}</MarkdownBody>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <MarkdownComposer
        value={draft}
        onChange={onDraftChange}
        workItemId={workItemId}
        minHeight={96}
        placeholder="Leave a comment… paste a screenshot to attach it."
        onUploaded={onUploaded}
        footer={
          <Button size="sm" disabled={!draft.trim() || posting} onClick={onPost}>
            Comment
          </Button>
        }
      />
    </section>
  )
}
