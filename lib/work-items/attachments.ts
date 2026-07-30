import 'server-only'

import { and, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { workItemAttachments } from '@/lib/db/schema'

/**
 * Attachment storage. Every read/write of attachment bytes goes through this
 * module — the rest of the app only ever sees ids, metadata, and the
 * `/api/attachments/<id>` URL. Bytes currently live in Postgres as base64
 * because no object store is configured for this deployment; swapping to a
 * bucket means reimplementing `storeAttachment` / `readAttachmentBytes` here
 * and nothing else.
 */

export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024

// Types we are willing to render inline in a browser tab. Anything else is
// stored but always served as a download — an uploaded .html or .svg must not
// be able to run script on our origin.
const INLINE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
  'text/plain',
])

export function isInlineContentType(contentType: string): boolean {
  return INLINE_CONTENT_TYPES.has(contentType.toLowerCase())
}

export function isImageContentType(contentType: string): boolean {
  const type = contentType.toLowerCase()
  return type.startsWith('image/') && INLINE_CONTENT_TYPES.has(type)
}

export interface AttachmentMeta {
  id: string
  workItemId: string
  commentId: string | null
  filename: string
  contentType: string
  size: number
  url: string
  uploadedByMemberId: string | null
  createdAt: Date
}

export function attachmentUrl(id: string): string {
  return `/api/attachments/${id}`
}

/** Strips directory parts and control characters from a client-supplied name. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file'
  const cleaned = Array.from(base)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code >= 0x20 && code !== 0x7f
    })
    .join('')
    .trim()
  return (cleaned || 'file').slice(0, 200)
}

export async function storeAttachment(input: {
  workspaceId: string
  workItemId: string
  commentId?: string | null
  uploadedByMemberId: string | null
  filename: string
  contentType: string
  bytes: ArrayBuffer
}): Promise<AttachmentMeta> {
  const buffer = Buffer.from(input.bytes)
  const [row] = await db
    .insert(workItemAttachments)
    .values({
      id: nanoid(),
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      commentId: input.commentId ?? null,
      uploadedByMemberId: input.uploadedByMemberId,
      filename: safeFilename(input.filename),
      contentType: input.contentType || 'application/octet-stream',
      size: buffer.byteLength,
      data: buffer.toString('base64'),
    })
    .returning({
      id: workItemAttachments.id,
      workItemId: workItemAttachments.workItemId,
      commentId: workItemAttachments.commentId,
      filename: workItemAttachments.filename,
      contentType: workItemAttachments.contentType,
      size: workItemAttachments.size,
      uploadedByMemberId: workItemAttachments.uploadedByMemberId,
      createdAt: workItemAttachments.createdAt,
    })

  return { ...row, url: attachmentUrl(row.id) }
}

/** Metadata only — never selects the base64 column. */
export async function listAttachments(workspaceId: string, workItemId: string): Promise<AttachmentMeta[]> {
  const rows = await db
    .select({
      id: workItemAttachments.id,
      workItemId: workItemAttachments.workItemId,
      commentId: workItemAttachments.commentId,
      filename: workItemAttachments.filename,
      contentType: workItemAttachments.contentType,
      size: workItemAttachments.size,
      uploadedByMemberId: workItemAttachments.uploadedByMemberId,
      createdAt: workItemAttachments.createdAt,
    })
    .from(workItemAttachments)
    .where(and(eq(workItemAttachments.workspaceId, workspaceId), eq(workItemAttachments.workItemId, workItemId)))
    .orderBy(desc(workItemAttachments.createdAt))

  return rows.map((row) => ({ ...row, url: attachmentUrl(row.id) }))
}

export async function readAttachmentBytes(
  workspaceId: string,
  id: string,
): Promise<{ filename: string; contentType: string; bytes: Buffer } | null> {
  const [row] = await db
    .select({
      filename: workItemAttachments.filename,
      contentType: workItemAttachments.contentType,
      data: workItemAttachments.data,
    })
    .from(workItemAttachments)
    .where(and(eq(workItemAttachments.id, id), eq(workItemAttachments.workspaceId, workspaceId)))
    .limit(1)

  if (!row) return null
  return { filename: row.filename, contentType: row.contentType, bytes: Buffer.from(row.data, 'base64') }
}

export async function deleteAttachment(workspaceId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(workItemAttachments)
    .where(and(eq(workItemAttachments.id, id), eq(workItemAttachments.workspaceId, workspaceId)))
    .returning({ id: workItemAttachments.id })
  return deleted.length > 0
}
