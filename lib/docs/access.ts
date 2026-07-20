import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { docCollaborators, docs, type Doc, type DocPermission } from '@/lib/db/schema'
import type { WorkspaceContext } from '@/lib/auth/workspace-context'

export interface DocAccess {
  doc: Doc
  /** Highest permission this member has. Owner is always 'edit'. */
  permission: DocPermission
  isOwner: boolean
}

function higherPermission(a: DocPermission, b: DocPermission): DocPermission {
  return a === 'edit' || b === 'edit' ? 'edit' : 'view'
}

// Central gate for every doc read/write. Returns null when the doc doesn't
// exist in this workspace, or exists but the viewer has no access — callers
// treat both identically (404), never leaking whether a private doc exists.
export async function resolveDocAccess(ctx: WorkspaceContext, docId: string): Promise<DocAccess | null> {
  const [doc] = await db
    .select()
    .from(docs)
    .where(and(eq(docs.id, docId), eq(docs.workspaceId, ctx.workspaceId)))
    .limit(1)
  if (!doc) return null

  if (doc.ownerMemberId === ctx.member.id) {
    return { doc, permission: 'edit', isOwner: true }
  }

  let permission: DocPermission | null = doc.shareMode === 'workspace' ? doc.workspacePermission : null

  const [collaborator] = await db
    .select({ permission: docCollaborators.permission })
    .from(docCollaborators)
    .where(and(eq(docCollaborators.docId, docId), eq(docCollaborators.memberId, ctx.member.id)))
    .limit(1)
  if (collaborator) {
    permission = permission ? higherPermission(permission, collaborator.permission) : collaborator.permission
  }

  if (!permission) return null
  return { doc, permission, isOwner: false }
}
