import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const UPLOADED_FILES_BUCKET = 'Uploaded_Files'

// Bucket is private; every read goes through a signed URL rather than a
// permanent public link, and the app re-requests one on every view via
// /api/attachments/[id] rather than caching it client-side.
const SIGNED_URL_TTL_SECONDS = 5 * 60

// Reuse one client across dev HMR reloads and serverless warm invocations,
// same rationale as lib/db/client.ts.
const globalForSupabase = globalThis as unknown as { __beaconSupabaseStorage?: SupabaseClient }

function createStorageClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required')
  }
  // Service-role key bypasses RLS — this client must never reach a client
  // component or route handler response.
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

function getClient(): SupabaseClient {
  if (!globalForSupabase.__beaconSupabaseStorage) {
    globalForSupabase.__beaconSupabaseStorage = createStorageClient()
  }
  return globalForSupabase.__beaconSupabaseStorage
}

export async function uploadFile(path: string, bytes: Buffer, contentType: string): Promise<void> {
  const { error } = await getClient()
    .storage.from(UPLOADED_FILES_BUCKET)
    .upload(path, bytes, { contentType, upsert: false })
  if (error) throw new Error(`Supabase upload failed: ${error.message}`)
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await getClient().storage.from(UPLOADED_FILES_BUCKET).remove([path])
  if (error) throw new Error(`Supabase delete failed: ${error.message}`)
}

/**
 * `downloadName` set forces a `Content-Disposition: attachment` response
 * with that filename; left unset, the file is served inline using the
 * content-type it was uploaded with.
 */
export async function createSignedUrl(path: string, downloadName?: string): Promise<string> {
  const { data, error } = await getClient()
    .storage.from(UPLOADED_FILES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, downloadName ? { download: downloadName } : undefined)
  if (error || !data) throw new Error(`Supabase signed URL failed: ${error?.message}`)
  return data.signedUrl
}
