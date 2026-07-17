import { type NextRequest } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { knowledgeDocuments, knowledgeSignals } from '@/lib/db/schema'
import { runKnowledgeExtraction } from '@/lib/knowledge/ingest-pipeline'
import {
  UnreachableUrlError,
  UnsupportedContentError,
  extractDocxText,
  extractSpreadsheetText,
  fetchLinkContent,
} from '@/lib/knowledge/ingest-sources'
import { ingestEvents } from '@/lib/events/ingest'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'

export const runtime = 'nodejs'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_KNOWLEDGE_CHARS = 20000

const knowledgeSourceSchema = z.enum([
  'note',
  'email',
  'doc',
  'pdf',
  'whatsapp',
  'word',
  'excel',
  'notion',
  'google_doc',
  'google_sheet',
  'url',
  'meeting_notes',
  'other',
])

const ingestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  sourceType: knowledgeSourceSchema.default('note'),
  content: z.string().trim().min(40).max(MAX_KNOWLEDGE_CHARS),
})

type KnowledgeIngestInput = z.infer<typeof ingestSchema>
type ParsedKnowledgeRequest = { input: KnowledgeIngestInput; sourceUrl: string | null }

type FileKind = 'pdf' | 'word' | 'excel'

function detectFileKind(file: File): FileKind | null {
  const name = file.name.toLowerCase()

  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return 'word'
  }

  if (
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel' ||
    file.type === 'text/csv' ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv')
  ) {
    return 'excel'
  }

  return null
}

function getFileTitle(fileName: string, fallback: string) {
  const trimmed = fileName.trim()
  if (!trimmed) return fallback

  return trimmed.replace(/\.[a-z0-9]+$/i, '').slice(0, 160) || fallback
}

function normalizePdfText(value: string) {
  return value
    .replace(/\0/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function defaultLinkTitle(sourceType: string) {
  if (sourceType === 'notion') return 'Notion page'
  if (sourceType === 'google_doc') return 'Google Doc'
  if (sourceType === 'google_sheet') return 'Google Sheet'
  return 'Linked page'
}

async function parseKnowledgeRequest(req: NextRequest): Promise<ParsedKnowledgeRequest | null> {
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) return null

    const kind = detectFileKind(file)
    if (!kind) return null

    if (file.size > MAX_FILE_BYTES) {
      throw new Error('FILE_TOO_LARGE')
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    let content: string
    let sourceType: KnowledgeIngestInput['sourceType']
    let fallbackTitle: string

    if (kind === 'pdf') {
      const result = await pdfParse(buffer)
      content = normalizePdfText(result.text)
      sourceType = 'pdf'
      fallbackTitle = 'PDF upload'
    } else if (kind === 'word') {
      content = await extractDocxText(buffer)
      sourceType = 'word'
      fallbackTitle = 'Word document'
    } else {
      content = await extractSpreadsheetText(buffer)
      sourceType = 'excel'
      fallbackTitle = 'Spreadsheet'
    }

    const parsed = ingestSchema.safeParse({
      title: formData.get('title') || getFileTitle(file.name, fallbackTitle),
      sourceType,
      content: content.slice(0, MAX_KNOWLEDGE_CHARS),
    })

    return parsed.success ? { input: parsed.data, sourceUrl: null } : null
  }

  const body = (await req.json()) as unknown

  if (
    body &&
    typeof body === 'object' &&
    'sourceUrl' in body &&
    typeof body.sourceUrl === 'string' &&
    body.sourceUrl.trim()
  ) {
    const trimmedUrl = body.sourceUrl.trim()
    const fetched = await fetchLinkContent(trimmedUrl)
    const providedTitle = 'title' in body && typeof body.title === 'string' ? body.title.trim() : ''

    const parsed = ingestSchema.safeParse({
      title: providedTitle || fetched.title || defaultLinkTitle(fetched.sourceType),
      sourceType: fetched.sourceType,
      content: fetched.text.slice(0, MAX_KNOWLEDGE_CHARS),
    })

    return parsed.success ? { input: parsed.data, sourceUrl: trimmedUrl } : null
  }

  const parsed = ingestSchema.safeParse(body)
  return parsed.success ? { input: parsed.data, sourceUrl: null } : null
}

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [documents, signals] = await Promise.all([
    db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.workspaceId, ctx.workspaceId))
      .orderBy(desc(knowledgeDocuments.createdAt))
      .limit(50),
    db
      .select()
      .from(knowledgeSignals)
      .where(eq(knowledgeSignals.workspaceId, ctx.workspaceId))
      .orderBy(desc(knowledgeSignals.createdAt))
      .limit(100),
  ])

  return Response.json({ documents, signals })
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let parsedRequest: ParsedKnowledgeRequest | null = null
  try {
    parsedRequest = await parseKnowledgeRequest(req)
  } catch (error) {
    if (error instanceof Error && error.message === 'FILE_TOO_LARGE') {
      return Response.json({ error: 'File must be 10MB or smaller' }, { status: 400 })
    }
    if (error instanceof UnreachableUrlError || error instanceof UnsupportedContentError) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    return Response.json({ error: 'Invalid knowledge input' }, { status: 400 })
  }

  if (!parsedRequest) {
    return Response.json({ error: 'Invalid knowledge input' }, { status: 400 })
  }

  const { input: knowledgeInput, sourceUrl } = parsedRequest
  const documentId = nanoid()
  const now = new Date()

  let document: typeof knowledgeDocuments.$inferSelect
  try {
    const [insertedDocument] = await db
      .insert(knowledgeDocuments)
      .values({
        id: documentId,
        workspaceId: ctx.workspaceId,
        title: knowledgeInput.title,
        sourceType: knowledgeInput.sourceType,
        sourceUrl,
        content: knowledgeInput.content,
        lastSyncedAt: sourceUrl ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    document = insertedDocument
  } catch {
    return Response.json({ error: 'Knowledge source could not be saved' }, { status: 500 })
  }

  const result = await runKnowledgeExtraction({
    documentId,
    workspaceId: ctx.workspaceId,
    title: knowledgeInput.title,
    content: knowledgeInput.content,
    initialDocument: document,
  })

  await ingestEvents(
    [
      {
        type: 'knowledge.added',
        source: 'knowledge',
        summary: `Knowledge added: ${knowledgeInput.title}`,
        externalId: `knowledge:${documentId}`,
        payload: { documentId, sourceType: knowledgeInput.sourceType },
      },
    ],
    { workspaceId: ctx.workspaceId },
  )

  return Response.json(result, { status: 201 })
}
