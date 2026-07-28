'use client'

import { useState } from 'react'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkItemDetail } from './detail/use-work-item-detail'
import { WorkItemHeader } from './detail/work-item-header'
import { WorkItemTriageBar } from './detail/work-item-triage-bar'
import { WorkItemDescription } from './detail/work-item-description'
import { WorkItemRelations } from './detail/work-item-relations'
import { WorkItemActivity } from './detail/work-item-activity'
import { WorkItemPropertiesRail } from './detail/work-item-properties-rail'
import { WorkItemWatchers } from './detail/work-item-watchers'
import { PickWorkItemDialog, type PickableWorkItem } from './pick-work-item-dialog'
import { DocBacklinks } from './doc-backlinks'
import type { RosterOption } from '@/lib/work-items/types'
import type { WorkItemRelationType } from '@/lib/db/schema'

export function WorkItemDetailSheet({
  itemId,
  open,
  onClose,
  roster,
  currentMemberId,
}: {
  itemId: string | null
  open: boolean
  onClose: () => void
  roster: RosterOption[]
  currentMemberId: string
}) {
  const [editingDesc, setEditingDesc] = useState(false)
  const [pickerFor, setPickerFor] = useState<WorkItemRelationType | 'duplicate-triage' | null>(null)

  const {
    item,
    setItem,
    events,
    relations,
    watchers,
    engineOptions,
    teamOptions,
    projectOptions,
    loading,
    descriptionDraft,
    setDescriptionDraft,
    labelsDraft,
    setLabelsDraft,
    patch,
    triage,
    addRelation,
    removeRelation,
    toggleWatch,
    addWatcher,
    removeWatcherEntry,
    handleDelete,
  } = useWorkItemDetail(itemId, open, currentMemberId, onClose)

  function handleClose(value: boolean) {
    if (value) return
    setEditingDesc(false)
    setPickerFor(null)
    onClose()
  }

  const relatedIds = relations
    ? [
        item?.id,
        ...relations.blocks.map((r) => r.item.id),
        ...relations.blockedBy.map((r) => r.item.id),
        ...(relations.duplicateOf ? [relations.duplicateOf.item.id] : []),
        ...relations.duplicates.map((r) => r.item.id),
        ...relations.related.map((r) => r.item.id),
      ].filter((id): id is string => !!id)
    : item
      ? [item.id]
      : []

  return (
    <Drawer open={open} onOpenChange={handleClose} direction="right">
      <DrawerContent className="!w-full sm:!max-w-3xl">
        {loading || !item ? (
          <div className="flex h-full flex-col gap-4 p-6">
            <DrawerTitle className="sr-only">Loading work item</DrawerTitle>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <WorkItemHeader item={item} onDelete={handleDelete} />

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
              <div className="min-w-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                <Input
                  value={item.title}
                  onChange={(e) => setItem({ ...item, title: e.target.value })}
                  onBlur={() => item.title.trim() && patch({ title: item.title.trim() })}
                  placeholder="Untitled"
                  className="h-auto border-none px-0 text-2xl font-semibold leading-tight tracking-tight shadow-none focus-visible:ring-0"
                />

                {item.status === 'triage' && (
                  <WorkItemTriageBar onTriage={triage} onMarkDuplicate={() => setPickerFor('duplicate-triage')} />
                )}

                <WorkItemDescription
                  description={item.description}
                  editing={editingDesc}
                  draft={descriptionDraft}
                  onDraftChange={setDescriptionDraft}
                  onStartEdit={() => setEditingDesc(true)}
                  onSave={() => {
                    if (descriptionDraft !== (item.description ?? '')) patch({ description: descriptionDraft || null })
                    setItem({ ...item, description: descriptionDraft || null })
                    setEditingDesc(false)
                  }}
                  onCancel={() => {
                    setDescriptionDraft(item.description ?? '')
                    setEditingDesc(false)
                  }}
                />

                <WorkItemRelations relations={relations} onPick={setPickerFor} onRemove={removeRelation} />

                {itemId && <DocBacklinks workItemId={itemId} />}

                <WorkItemActivity events={events} />
              </div>

              <aside className="shrink-0 space-y-4 overflow-y-auto border-t bg-muted/20 px-5 py-5 lg:w-[248px] lg:border-l lg:border-t-0">
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
              </aside>
            </div>
          </div>
        )}
      </DrawerContent>

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
    </Drawer>
  )
}
