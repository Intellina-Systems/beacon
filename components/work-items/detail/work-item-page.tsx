'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { DocBacklinks } from '@/components/work-items/doc-backlinks'
import { PickWorkItemDialog, type PickableWorkItem } from '@/components/work-items/pick-work-item-dialog'
import type { RosterOption } from '@/lib/work-items/types'
import type { WorkItemRelationType } from '@/lib/db/schema'
import { useWorkItemDetail } from './use-work-item-detail'
import { WorkItemHeader } from './work-item-header'
import { WorkItemTriageBar } from './work-item-triage-bar'
import { WorkItemDescription } from './work-item-description'
import { WorkItemRelations } from './work-item-relations'
import { WorkItemAttachments } from './work-item-attachments'
import { WorkItemComments } from './work-item-comments'
import { WorkItemGitActivity } from './work-item-git-activity'
import { WorkItemActivity } from './work-item-activity'
import { WorkItemPropertiesRail } from './work-item-properties-rail'
import { WorkItemWatchers } from './work-item-watchers'

/**
 * Full-page work item view. Replaces the old right-hand drawer: an issue gets
 * the whole viewport, so a description with screenshots, a comment thread, and
 * the derived activity feed can all be read without a scrollbar fight.
 */
export function WorkItemPage({
  itemId,
  roster,
  currentMemberId,
  canModerate,
  projectName,
  backHref = '/work',
}: {
  itemId: string
  roster: RosterOption[]
  currentMemberId: string
  canModerate: boolean
  projectName: string | null
  backHref?: string
}) {
  const router = useRouter()
  const [editingDesc, setEditingDesc] = useState(false)
  const [savingDesc, setSavingDesc] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [pickerFor, setPickerFor] = useState<WorkItemRelationType | 'duplicate-triage' | null>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  const {
    item,
    setItem,
    events,
    relations,
    watchers,
    comments,
    attachments,
    engineOptions,
    teamOptions,
    projectOptions,
    loading,
    descriptionDraft,
    setDescriptionDraft,
    labelsDraft,
    setLabelsDraft,
    loadAttachments,
    patch,
    triage,
    addRelation,
    removeRelation,
    toggleWatch,
    addWatcher,
    removeWatcherEntry,
    postComment,
    editComment,
    removeComment,
    handleDelete,
  } = useWorkItemDetail(itemId, currentMemberId, () => router.push(backHref))

  // The title is a textarea so long titles wrap instead of scrolling sideways;
  // that means its height has to be driven from content on every change.
  const title = item?.title
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  if (loading || !item) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5 px-6 py-10">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const relatedIds = relations
    ? [
        item.id,
        ...relations.blocks.map((r) => r.item.id),
        ...relations.blockedBy.map((r) => r.item.id),
        ...(relations.duplicateOf ? [relations.duplicateOf.item.id] : []),
        ...relations.duplicates.map((r) => r.item.id),
        ...relations.related.map((r) => r.item.id),
      ]
    : [item.id]

  async function saveDescription() {
    if (!item) return
    setSavingDesc(true)
    try {
      if (descriptionDraft !== (item.description ?? '')) await patch({ description: descriptionDraft || null })
      setItem({ ...item, description: descriptionDraft || null })
      setEditingDesc(false)
    } finally {
      setSavingDesc(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <WorkItemHeader item={item} projectName={projectName} backHref={backHref} onDelete={handleDelete} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 lg:flex-row lg:px-8 lg:py-10">
          <main className="min-w-0 flex-1 space-y-8">
            <div className="space-y-4">
              <textarea
                ref={titleRef}
                value={item.title}
                rows={1}
                onChange={(e) => setItem({ ...item, title: e.target.value })}
                onBlur={() => item.title.trim() && patch({ title: item.title.trim() })}
                placeholder="Untitled"
                aria-label="Title"
                className="w-full resize-none bg-transparent text-2xl font-semibold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/50 lg:text-[28px]"
              />

              {item.status === 'triage' && (
                <WorkItemTriageBar onTriage={triage} onMarkDuplicate={() => setPickerFor('duplicate-triage')} />
              )}

              <WorkItemDescription
                workItemId={item.id}
                description={item.description}
                editing={editingDesc}
                draft={descriptionDraft}
                saving={savingDesc}
                onDraftChange={setDescriptionDraft}
                onStartEdit={() => setEditingDesc(true)}
                onSave={saveDescription}
                onCancel={() => {
                  setDescriptionDraft(item.description ?? '')
                  setEditingDesc(false)
                }}
                onUploaded={loadAttachments}
              />
            </div>

            <WorkItemRelations relations={relations} onPick={setPickerFor} onRemove={removeRelation} />

            <WorkItemAttachments workItemId={item.id} attachments={attachments} onChanged={loadAttachments} />

            <DocBacklinks workItemId={item.id} />

            <WorkItemComments
              workItemId={item.id}
              comments={comments}
              currentMemberId={currentMemberId}
              canModerate={canModerate}
              draft={commentDraft}
              posting={posting}
              onDraftChange={setCommentDraft}
              onPost={async () => {
                setPosting(true)
                try {
                  if (await postComment(commentDraft.trim())) setCommentDraft('')
                } finally {
                  setPosting(false)
                }
              }}
              onEdit={editComment}
              onDelete={removeComment}
              onUploaded={loadAttachments}
            />

            <WorkItemGitActivity events={events} />

            <WorkItemActivity events={events} />
          </main>

          <aside className="shrink-0 lg:w-[264px]">
            <div className="space-y-4 lg:sticky lg:top-20">
              <WorkItemPropertiesRail
                item={item}
                onItemChange={setItem}
                onPatch={patch}
                roster={roster}
                engineOptions={engineOptions}
                teamOptions={teamOptions}
                projectOptions={projectOptions}
                labelsDraft={labelsDraft}
                onLabelsDraftChange={setLabelsDraft}
              />
              <WorkItemWatchers
                watchers={watchers}
                roster={roster}
                currentMemberId={currentMemberId}
                onToggleWatch={toggleWatch}
                onAddWatcher={addWatcher}
                onRemoveWatcher={removeWatcherEntry}
              />
            </div>
          </aside>
        </div>
      </div>

      <PickWorkItemDialog
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        excludeIds={relatedIds}
        title={
          pickerFor === 'blocks'
            ? 'This item blocks…'
            : pickerFor === 'related'
              ? 'Relate to…'
              : 'Mark as a duplicate of…'
        }
        onPick={(picked: PickableWorkItem) => {
          if (pickerFor === 'duplicate-triage') {
            addRelation(picked.id, 'duplicate')
          } else if (pickerFor) {
            addRelation(picked.id, pickerFor as WorkItemRelationType)
          }
        }}
      />
    </div>
  )
}
