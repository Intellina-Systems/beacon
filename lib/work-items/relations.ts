import 'server-only'

import { and, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { workItemRelations, workItems, type WorkItemRelationType, type WorkItemStatus } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { addWatchers, listWatchers } from './watchers'

export class RelationError extends Error {}

interface WorkItemRef {
  id: string
  key: string | null
  title: string
  status: WorkItemStatus
}

async function loadItem(workspaceId: string, id: string): Promise<WorkItemRef> {
  const [row] = await db
    .select({ id: workItems.id, key: workItems.key, title: workItems.title, status: workItems.status })
    .from(workItems)
    .where(and(eq(workItems.id, id), eq(workItems.workspaceId, workspaceId)))
    .limit(1)
  if (!row) throw new RelationError(`Work item ${id} not found in this workspace`)
  return row
}

// 'related' is symmetric — always stored with the lexicographically smaller id
// first so the DB unique index on (itemId, relatedItemId, type) prevents the
// same pair being recorded twice regardless of which item the caller started from.
function canonicalOrder(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export interface AddRelationResult {
  relation: typeof workItemRelations.$inferSelect
  duplicateMerge?: { canonicalId: string; duplicateId: string; watchersMoved: number }
}

// Create a relation between two items. Handles canonicalization for `related`
// and, for `duplicate`, merges the duplicate into the canonical item: its
// watchers are added to the canonical item and its status is set to cancelled.
export async function addRelation(
  workspaceId: string,
  itemId: string,
  relatedItemId: string,
  type: WorkItemRelationType,
  createdByMemberId: string,
): Promise<AddRelationResult> {
  if (itemId === relatedItemId) {
    throw new RelationError('A work item cannot relate to itself')
  }
  const [item, related] = await Promise.all([loadItem(workspaceId, itemId), loadItem(workspaceId, relatedItemId)])

  const [storedItemId, storedRelatedId] =
    type === 'related' ? canonicalOrder(itemId, relatedItemId) : [itemId, relatedItemId]

  const [relation] = await db
    .insert(workItemRelations)
    .values({
      id: generateId(),
      workspaceId,
      itemId: storedItemId,
      relatedItemId: storedRelatedId,
      type,
      createdByMemberId,
    })
    .onConflictDoNothing({
      target: [workItemRelations.itemId, workItemRelations.relatedItemId, workItemRelations.type],
    })
    .returning()

  if (!relation) {
    throw new RelationError('This relation already exists')
  }

  if (type !== 'duplicate') {
    return { relation }
  }

  // itemId is being marked a duplicate of relatedItemId (the canonical item).
  const duplicateWatchers = await listWatchers(item.id)
  await addWatchers(
    workspaceId,
    related.id,
    duplicateWatchers.map((w) => ({ memberId: w.memberId, reason: 'manual' as const })),
  )
  await db
    .update(workItems)
    .set({ status: 'cancelled', statusChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(workItems.id, item.id))

  return {
    relation,
    duplicateMerge: { canonicalId: related.id, duplicateId: item.id, watchersMoved: duplicateWatchers.length },
  }
}

export async function removeRelation(workspaceId: string, relationId: string): Promise<boolean> {
  const deleted = await db
    .delete(workItemRelations)
    .where(and(eq(workItemRelations.id, relationId), eq(workItemRelations.workspaceId, workspaceId)))
    .returning({ id: workItemRelations.id })
  return deleted.length > 0
}

export interface RelationsView {
  blocks: { relationId: string; item: WorkItemRef }[] // this item blocks these
  blockedBy: { relationId: string; item: WorkItemRef }[] // these items block this item
  duplicateOf: { relationId: string; item: WorkItemRef } | null // canonical item, if this is a duplicate
  duplicates: { relationId: string; item: WorkItemRef }[] // items that are duplicates of this one
  related: { relationId: string; item: WorkItemRef }[]
}

export async function listRelations(workspaceId: string, itemId: string): Promise<RelationsView> {
  const rows = await db
    .select({
      relationId: workItemRelations.id,
      type: workItemRelations.type,
      itemId: workItemRelations.itemId,
      relatedItemId: workItemRelations.relatedItemId,
      otherId: workItems.id,
      otherKey: workItems.key,
      otherTitle: workItems.title,
      otherStatus: workItems.status,
    })
    .from(workItemRelations)
    .innerJoin(
      workItems,
      or(
        and(eq(workItemRelations.itemId, itemId), eq(workItems.id, workItemRelations.relatedItemId)),
        and(eq(workItemRelations.relatedItemId, itemId), eq(workItems.id, workItemRelations.itemId)),
      ),
    )
    .where(
      and(
        eq(workItemRelations.workspaceId, workspaceId),
        or(eq(workItemRelations.itemId, itemId), eq(workItemRelations.relatedItemId, itemId)),
      ),
    )

  const view: RelationsView = { blocks: [], blockedBy: [], duplicateOf: null, duplicates: [], related: [] }

  for (const row of rows) {
    const other: WorkItemRef = { id: row.otherId, key: row.otherKey, title: row.otherTitle, status: row.otherStatus }
    const entry = { relationId: row.relationId, item: other }
    if (row.type === 'blocks') {
      if (row.itemId === itemId) view.blocks.push(entry)
      else view.blockedBy.push(entry)
    } else if (row.type === 'duplicate') {
      if (row.itemId === itemId) view.duplicateOf = entry
      else view.duplicates.push(entry)
    } else {
      view.related.push(entry)
    }
  }

  return view
}

// Linear's auto-demote: when the blocking item is resolved (done/cancelled),
// any "blocks" relation it holds no longer blocks anything — demote it to
// "related" so the history is preserved without an active blocker flag.
// Called after a status update lands on `done` or `cancelled`.
export async function demoteResolvedBlocks(workspaceId: string, resolvedItemId: string): Promise<number> {
  const blockingRows = await db
    .select({ id: workItemRelations.id, relatedItemId: workItemRelations.relatedItemId })
    .from(workItemRelations)
    .where(
      and(
        eq(workItemRelations.workspaceId, workspaceId),
        eq(workItemRelations.itemId, resolvedItemId),
        eq(workItemRelations.type, 'blocks'),
      ),
    )
  if (blockingRows.length === 0) return 0

  let demoted = 0
  for (const row of blockingRows) {
    const [canonicalItemId, canonicalRelatedId] = canonicalOrder(resolvedItemId, row.relatedItemId)
    const [existingRelated] = await db
      .select({ id: workItemRelations.id })
      .from(workItemRelations)
      .where(
        and(
          eq(workItemRelations.workspaceId, workspaceId),
          eq(workItemRelations.itemId, canonicalItemId),
          eq(workItemRelations.relatedItemId, canonicalRelatedId),
          eq(workItemRelations.type, 'related'),
        ),
      )
      .limit(1)

    if (existingRelated) {
      // Already related via the other direction — just drop the stale blocks edge.
      await db.delete(workItemRelations).where(eq(workItemRelations.id, row.id))
    } else {
      await db
        .update(workItemRelations)
        .set({ type: 'related', itemId: canonicalItemId, relatedItemId: canonicalRelatedId })
        .where(eq(workItemRelations.id, row.id))
    }
    demoted++
  }
  return demoted
}
