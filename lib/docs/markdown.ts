import 'server-only'

import { generateId } from '@/lib/utils/id'

// Hand-rolled markdown <-> BlockNote-block conversion for MCP-authored docs.
//
// The obvious approach — construct a real BlockNoteEditor server-side and
// call its own tryParseMarkdownToBlocks/markdown exporter — was spiked and
// rejected: @blocknote/core lists jsdom as a dependency, but grepping its
// source shows jsdom is only ever referenced in the package's OWN test files
// (`@vitest-environment jsdom`), never as a runtime fallback. Constructing a
// BlockNoteEditor unconditionally instantiates a real Tiptap/ProseMirror
// editor in its constructor, which expects a real browser `window`/`document`
// — neither exists in a Vercel serverless function. This is the documented
// fallback: lower fidelity than BlockNote's own parser (no tables, nested
// lists, or embeds), but covers what an agent actually writes — headings,
// paragraphs, bullet/numbered/check lists, quotes, dividers, and inline
// bold/italic/code — with zero risk of dragging a DOM shim into a serverless
// bundle.
//
// Blocks are intentionally partial (id/type/props/content/children only,
// omitting textColor/backgroundColor/textAlignment/etc.) — doc-editor.tsx
// already loads doc.content via BlockNote's own `initialContent`, which
// fills in schema defaults for anything a partial block omits, the same way
// it already does for blocks a human created via the slash menu.

export type SimpleInline =
  | { type: 'text'; text: string; styles: Record<string, boolean> }
  | { type: 'link'; href: string; content: SimpleInline[] }

export interface SimpleBlock {
  id: string
  type: string
  props: Record<string, unknown>
  content: SimpleInline[]
  children: SimpleBlock[]
}

function plainText(text: string): SimpleInline {
  return { type: 'text', text, styles: {} }
}

function styledText(text: string, styles: Record<string, boolean>): SimpleInline {
  return { type: 'text', text, styles }
}

function linkNode(text: string, href: string): SimpleInline {
  return { type: 'link', href, content: [plainText(text)] }
}

// Bold before italic so "**x**" isn't mis-split by the single-asterisk rule.
const INLINE_PATTERN = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\*(.+?)\*)|(_(.+?)_)|(\[([^\]]+)\]\(([^)]+)\))/g

function parseInline(text: string): SimpleInline[] {
  const runs: SimpleInline[] = []
  let lastIndex = 0
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index
    if (index > lastIndex) runs.push(plainText(text.slice(lastIndex, index)))
    if (match[2] !== undefined) runs.push(styledText(match[2], { bold: true }))
    else if (match[4] !== undefined) runs.push(styledText(match[4], { code: true }))
    else if (match[6] !== undefined) runs.push(styledText(match[6], { italic: true }))
    else if (match[8] !== undefined) runs.push(styledText(match[8], { italic: true }))
    else if (match[10] !== undefined) runs.push(linkNode(match[10], match[11]))
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) runs.push(plainText(text.slice(lastIndex)))
  return runs.length > 0 ? runs : [plainText('')]
}

export function markdownToBlocks(markdown: string): SimpleBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: SimpleBlock[] = []

  function push(type: string, text: string, props: Record<string, unknown> = {}) {
    blocks.push({ id: generateId(), type, props, content: parseInline(text), children: [] })
  }

  for (const line of lines) {
    if (!line.trim()) continue // blank lines just separate blocks, no block of their own

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      push('heading', heading[2], { level: heading[1].length })
      continue
    }

    const checklist = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/)
    if (checklist) {
      push('checkListItem', checklist[2], { checked: checklist[1].toLowerCase() === 'x' })
      continue
    }

    const numbered = line.match(/^\d+\.\s+(.*)$/)
    if (numbered) {
      push('numberedListItem', numbered[1])
      continue
    }

    const bulleted = line.match(/^[-*]\s+(.*)$/)
    if (bulleted) {
      push('bulletListItem', bulleted[1])
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      push('quote', quote[1])
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ id: generateId(), type: 'divider', props: {}, content: [], children: [] })
      continue
    }

    push('paragraph', line)
  }

  return blocks.length > 0 ? blocks : [{ id: generateId(), type: 'paragraph', props: {}, content: [], children: [] }]
}

const HEADING_PREFIX: Record<number, string> = { 1: '#', 2: '##', 3: '###', 4: '####', 5: '#####', 6: '######' }

function inlineToText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((node) => {
      if (!node || typeof node !== 'object') return ''
      const n = node as { type?: unknown; text?: unknown; href?: unknown; content?: unknown }
      if (n.type === 'link') {
        const label = inlineToText(n.content)
        return typeof n.href === 'string' ? `[${label}](${n.href})` : label
      }
      return typeof n.text === 'string' ? n.text : ''
    })
    .join('')
}

// Mirrors markdownToBlocks in reverse, for the MCP get_doc tool — legible
// structure (headings, list markers, checkboxes) for a model to read and
// potentially round-trip back through update_doc, not a lossless export.
export function blocksToMarkdown(blocks: unknown[]): string {
  const lines: string[] = []

  function walk(block: unknown, depth: number): void {
    if (!block || typeof block !== 'object') return
    const b = block as { type?: unknown; props?: Record<string, unknown>; content?: unknown; children?: unknown[] }
    const text = inlineToText(b.content)
    const indent = '  '.repeat(depth)

    switch (b.type) {
      case 'heading': {
        const level = typeof b.props?.level === 'number' ? b.props.level : 1
        lines.push(`${HEADING_PREFIX[level] ?? '#'} ${text}`)
        break
      }
      case 'checkListItem':
        lines.push(`${indent}- [${b.props?.checked ? 'x' : ' '}] ${text}`)
        break
      case 'bulletListItem':
        lines.push(`${indent}- ${text}`)
        break
      case 'numberedListItem':
        lines.push(`${indent}1. ${text}`)
        break
      case 'quote':
        lines.push(`> ${text}`)
        break
      case 'divider':
        lines.push('---')
        break
      default:
        if (text.trim()) lines.push(text)
    }

    if (Array.isArray(b.children)) for (const child of b.children) walk(child, depth + 1)
  }

  for (const block of blocks) walk(block, 0)
  return lines.join('\n\n').trim()
}
