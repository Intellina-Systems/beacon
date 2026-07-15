import 'server-only'

import * as cheerio from 'cheerio'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

export type LinkSourceType = 'notion' | 'google_doc' | 'google_sheet' | 'url'

const FETCH_TIMEOUT_MS = 15000
const MAX_FETCH_BYTES = 5 * 1024 * 1024

export class UnreachableUrlError extends Error {}
export class UnsupportedContentError extends Error {}

function detectGoogleDocsId(url: URL): string | null {
  if (!url.hostname.endsWith('docs.google.com')) return null
  const match = url.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

function detectGoogleSheetsId(url: URL): { id: string; gid: string | null } | null {
  if (!url.hostname.endsWith('docs.google.com')) return null
  const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (!match) return null
  const gidFromHash = url.hash.match(/gid=(\d+)/)?.[1] ?? null
  const gid = url.searchParams.get('gid') ?? gidFromHash
  return { id: match[1], gid }
}

function detectLinkSourceType(url: URL): LinkSourceType {
  if (detectGoogleDocsId(url)) return 'google_doc'
  if (detectGoogleSheetsId(url)) return 'google_sheet'
  if (url.hostname.endsWith('notion.so') || url.hostname.endsWith('notion.site')) return 'notion'
  return 'url'
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

async function fetchWithLimits(url: string): Promise<{ contentType: string; buffer: Buffer }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'BeaconKnowledgeBot/1.0' },
    })

    if (!response.ok) {
      throw new UnreachableUrlError(`Request failed with status ${response.status}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    const arrayBuffer = await response.arrayBuffer()

    if (arrayBuffer.byteLength > MAX_FETCH_BYTES) {
      throw new UnsupportedContentError('Linked content is too large to ingest')
    }

    return { contentType, buffer: Buffer.from(arrayBuffer) }
  } catch (error) {
    if (error instanceof UnreachableUrlError || error instanceof UnsupportedContentError) throw error
    throw new UnreachableUrlError(error instanceof Error ? error.message : 'Failed to fetch URL')
  } finally {
    clearTimeout(timeout)
  }
}

function extractHtmlText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, noscript, svg, nav, footer, header').remove()
  return normalizeExtractedText($('body').text())
}

function extractHtmlTitle(html: string): string | null {
  const $ = cheerio.load(html)
  const title = $('title').first().text().trim() || $('h1').first().text().trim()
  return title || null
}

export async function fetchLinkContent(rawUrl: string): Promise<{
  text: string
  title: string | null
  sourceType: LinkSourceType
  fetchUrl: string
}> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UnreachableUrlError('Not a valid URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnreachableUrlError('Only http(s) links are supported')
  }

  const sourceType = detectLinkSourceType(url)

  if (sourceType === 'google_doc') {
    const id = detectGoogleDocsId(url)
    const exportUrl = `https://docs.google.com/document/d/${id}/export?format=txt`
    const { buffer } = await fetchWithLimits(exportUrl)
    const text = normalizeExtractedText(buffer.toString('utf8'))
    if (!text) {
      throw new UnsupportedContentError(
        'Google Doc has no extractable text, or it is not shared with "Anyone with the link".',
      )
    }
    return { text, title: null, sourceType, fetchUrl: exportUrl }
  }

  if (sourceType === 'google_sheet') {
    const parsed = detectGoogleSheetsId(url)
    const exportUrl = `https://docs.google.com/spreadsheets/d/${parsed?.id}/export?format=csv${parsed?.gid ? `&gid=${parsed.gid}` : ''}`
    const { buffer } = await fetchWithLimits(exportUrl)
    const text = normalizeExtractedText(buffer.toString('utf8'))
    if (!text) {
      throw new UnsupportedContentError(
        'Google Sheet has no extractable data, or it is not shared with "Anyone with the link".',
      )
    }
    return { text, title: null, sourceType, fetchUrl: exportUrl }
  }

  // Notion and generic URLs: fetch raw HTML and pull out visible text.
  const { contentType, buffer } = await fetchWithLimits(url.toString())
  const isHtml = contentType.includes('text/html')
  const isPlainText = contentType.includes('text/plain')

  if (!isHtml && !isPlainText) {
    throw new UnsupportedContentError(`Unsupported content type: ${contentType || 'unknown'}`)
  }

  const raw = buffer.toString('utf8')
  const text = isHtml ? extractHtmlText(raw) : normalizeExtractedText(raw)
  const title = isHtml ? extractHtmlTitle(raw) : null

  if (!text) {
    throw new UnsupportedContentError(
      sourceType === 'notion'
        ? 'Could not extract text from this Notion page. Make sure it is shared publicly ("Share to web").'
        : 'Could not extract readable text from this page.',
    )
  }

  return { text, title, sourceType, fetchUrl: url.toString() }
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return normalizeExtractedText(result.value)
}

export async function extractSpreadsheetText(buffer: Buffer): Promise<string> {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sections = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    return `## ${name}\n${csv.trim()}`
  }).filter((section) => section.split('\n').length > 1)

  return normalizeExtractedText(sections.join('\n\n'))
}
