'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { docSchema } from './doc-schema'

type DocEditorInstance = typeof docSchema.BlockNoteEditor

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Flattens a work-item chip to plain text — exports have no live status. */
function mentionLabel(props: { itemKey: string; title: string }): string {
  return props.itemKey ? `${props.itemKey} ${props.title}` : props.title
}

function safeFilename(title: string, extension: string): string {
  const base =
    title
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase() || 'untitled'
  return `${base}.${extension}`
}

/**
 * PDF and DOCX export. Both exporters are pulled in on demand — they carry
 * their own font and document-format machinery, and a reader who never exports
 * should not pay for it on page load.
 */
export function DocExportMenu({ editor, title }: { editor: DocEditorInstance; title: string }) {
  const [busy, setBusy] = useState(false)

  async function exportPdf() {
    setBusy(true)
    try {
      const [{ PDFExporter, pdfDefaultSchemaMappings }, { docSchema }, reactPdf] = await Promise.all([
        import('@blocknote/xl-pdf-exporter'),
        import('./doc-schema'),
        import('@react-pdf/renderer'),
      ])
      const { Text, pdf } = reactPdf
      const exporter = new PDFExporter(docSchema, {
        ...pdfDefaultSchemaMappings,
        inlineContentMapping: {
          ...pdfDefaultSchemaMappings.inlineContentMapping,
          personMention: (inlineContent) => <Text>@{inlineContent.props.name}</Text>,
          workItemMention: (inlineContent) => <Text>{mentionLabel(inlineContent.props)}</Text>,
        },
      })
      const document = await exporter.toReactPDFDocument(editor.document)
      download(await pdf(document).toBlob(), safeFilename(title, 'pdf'))
    } catch {
      toast.error('Could not export PDF')
    } finally {
      setBusy(false)
    }
  }

  async function exportDocx() {
    setBusy(true)
    try {
      const [{ DOCXExporter, docxDefaultSchemaMappings }, { docSchema }, { TextRun }] = await Promise.all([
        import('@blocknote/xl-docx-exporter'),
        import('./doc-schema'),
        import('docx'),
      ])
      const exporter = new DOCXExporter(docSchema, {
        ...docxDefaultSchemaMappings,
        inlineContentMapping: {
          ...docxDefaultSchemaMappings.inlineContentMapping,
          personMention: (inlineContent) => new TextRun({ text: `@${inlineContent.props.name}` }),
          workItemMention: (inlineContent) => new TextRun({ text: mentionLabel(inlineContent.props) }),
        },
      })
      download(await exporter.toBlob(editor.document), safeFilename(title, 'docx'))
    } catch {
      toast.error('Could not export Word document')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={busy} className="h-7 gap-1.5 text-xs">
          <Download className="h-3.5 w-3.5" />
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void exportPdf()}>Download as PDF</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void exportDocx()}>Download as Word</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
