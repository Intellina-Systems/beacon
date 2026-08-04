import 'server-only'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docs, type Doc } from '@/lib/db/schema'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'
import { resolveDocAccess } from './access'
import { getParentMap, nextSiblingRank, wouldCreateCycle } from './tree'

export type MoveDocResult = { ok: true; doc: Doc } | { ok: false; error: string; status: number }

// Shared by PATCH /api/docs/[id] (parentId field) and the move_doc MCP tool,
// so the permission + cycle guard can never drift between the two entry
// points. newParentId: null moves the doc to top-level.
export async function moveDoc(
  ctx: WorkspaceContext,
  docId: string,
  newParentId: string | null,
): Promise<MoveDocResult> {
  const access = await resolveDocAccess(ctx, docId)
  if (!access) return { ok: false, error: 'Not found', status: 404 }
  if (access.permission !== 'edit') return { ok: false, error: 'Forbidden', status: 403 }

  if (newParentId) {
    const parentAccess = await resolveDocAccess(ctx, newParentId)
    if (!parentAccess) return { ok: false, error: 'Parent document not found', status: 404 }
    if (parentAccess.permission !== 'edit') {
      return { ok: false, error: "You don't have edit access to that parent document", status: 403 }
    }
    const allDocs = await getParentMap(ctx.workspaceId)
    if (wouldCreateCycle(allDocs, docId, newParentId)) {
      return { ok: false, error: 'Cannot move a document under itself or one of its own sub-pages', status: 400 }
    }
  }

  const rank = await nextSiblingRank(ctx.workspaceId, newParentId)
  const [updated] = await db
    .update(docs)
    .set({ parentId: newParentId, rank, updatedAt: new Date() })
    .where(eq(docs.id, docId))
    .returning()

  return { ok: true, doc: updated }
}
