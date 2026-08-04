import 'server-only'

import { and, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { workItemAttachments } from '@/lib/db/schema'
import { createSignedUrl, deleteFile, uploadFile } from '@/lib/supabase/storage'

/**
 * Attachment storage. Every read/write of attachment bytes goes through this
 * module — the rest of the app only ever sees ids, metadata, and the
 * `/api/attachments/<id>` URL. Bytes live in the Supabase Storage
 * "Uploaded_Files" bucket; Postgres only holds metadata and the object path.
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

function storagePathFor(workspaceId: string, workItemId: string, id: string): string {
  return `${workspaceId}/${workItemId}/${id}`
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
  const id = nanoid()
  const contentType = input.contentType || 'application/octet-stream'
  const storagePath = storagePathFor(input.workspaceId, input.workItemId, id)

  await uploadFile(storagePath, buffer, contentType)

  const [row] = await db
    .insert(workItemAttachments)
    .values({
      id,
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      commentId: input.commentId ?? null,
      uploadedByMemberId: input.uploadedByMemberId,
      filename: safeFilename(input.filename),
      contentType,
      size: buffer.byteLength,
      storagePath,
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
    .catch(async (err) => {
      // Row insert failed after the object was already written — don't leave
      // an orphaned file behind in the bucket.
      await deleteFile(storagePath).catch(() => {})
      throw err
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

export async function getAttachmentSignedUrl(workspaceId: string, id: string): Promise<string | null> {
  const [row] = await db
    .select({
      filename: workItemAttachments.filename,
      contentType: workItemAttachments.contentType,
      storagePath: workItemAttachments.storagePath,
    })
    .from(workItemAttachments)
    .where(and(eq(workItemAttachments.id, id), eq(workItemAttachments.workspaceId, workspaceId)))
    .limit(1)

  if (!row) return null
  // Inline-safe types render in the browser tab using their stored
  // content-type; everything else forces a download under its original name.
  const downloadName = isInlineContentType(row.contentType) ? undefined : row.filename
  return createSignedUrl(row.storagePath, downloadName)
}

export async function deleteAttachment(workspaceId: string, id: string): Promise<boolean> {
  const [deleted] = await db
    .delete(workItemAttachments)
    .where(and(eq(workItemAttachments.id, id), eq(workItemAttachments.workspaceId, workspaceId)))
    .returning({ id: workItemAttachments.id, storagePath: workItemAttachments.storagePath })
  if (!deleted) return false
  // DB row is the source of truth for "does this attachment exist" — a
  // failed bucket cleanup just leaves an orphaned object, not a broken link.
  await deleteFile(deleted.storagePath).catch((err) => console.error('attachment storage cleanup failed', err))
  return true
}
