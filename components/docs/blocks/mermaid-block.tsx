'use client'

import { useEffect, useId, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import mermaid from 'mermaid'
import { AlertTriangle } from 'lucide-react'

// Loaded once, in the browser only — this file is only ever reached through
// doc-schema.ts, which doc-editor-client.tsx/public-doc-view-client.tsx both
// import via next/dynamic(ssr:false), the same boundary BlockNote itself
// already needs (see the headless-parsing spike: BlockNoteEditor requires a
// real DOM too).
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', fontFamily: 'inherit' })

const DEFAULT_CODE = 'flowchart LR\n  A[Start] --> B{Decide}\n  B -->|Yes| C[Done]\n  B -->|No| A'

// mermaid has no React renderer of its own — dangerouslySetInnerHTML on its
// output is the library's own documented integration pattern. securityLevel
// 'strict' is mermaid's sanitization boundary (strips script tags and
// foreignObject), and the source here carries the same trust level as any
// other doc content already stored by an editor with no separate sandboxing.
function MermaidPreview({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // useId, not Math.random() — must stay pure during render; mermaid's
  // render() only needs a unique, stable-per-instance DOM id.
  const reactId = useId()
  const elementId = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    // The empty-source case is handled entirely by the render-time check
    // below, not via state — setting state synchronously in an effect body
    // (outside the async callback) risks a cascading render.
    if (!code.trim()) return
    let cancelled = false
    mermaid
      .render(elementId, code)
      .then(({ svg: rendered }) => {
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render diagram')
      })
    return () => {
      cancelled = true
    }
  }, [code, elementId])

  if (!code.trim()) {
    return <p className="mt-2 px-1 text-xs text-muted-foreground">Type Mermaid syntax above to render a diagram.</p>
  }

  if (error) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{error}</span>
      </div>
    )
  }

  if (!svg) {
    return <p className="mt-2 px-1 text-xs text-muted-foreground">Rendering…</p>
  }

  return <div className="mt-2 overflow-x-auto [&_svg]:mx-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}

const mermaidBlockConfig = {
  type: 'mermaidDiagram',
  propSchema: { code: { default: DEFAULT_CODE } },
  content: 'none',
} as const

// Editable: a code textarea (edited via editor.updateBlock, the same
// controlled-prop pattern BlockNote's own custom-block examples use) with
// the live-rendered diagram directly beneath it — both visible at once
// rather than a separate edit/view toggle, to keep the interaction simple.
export const MermaidBlock = createReactBlockSpec(mermaidBlockConfig, {
  render: ({ block, editor }) => (
    <div className="w-full rounded-md border bg-muted/20 p-3">
      <textarea
        value={block.props.code}
        onChange={(e) => editor.updateBlock(block, { type: 'mermaidDiagram', props: { code: e.target.value } })}
        placeholder="Mermaid diagram syntax…"
        spellCheck={false}
        rows={4}
        className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 font-mono text-xs leading-relaxed focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      />
      <MermaidPreview code={block.props.code} />
    </div>
  ),
})

// Public share view: renders only the diagram, no textarea — a reader has
// no edit permission, matching the WorkItemMentionStatic/PersonMentionStatic
// convention of a read-only twin with an identical prop schema.
export const MermaidBlockStatic = createReactBlockSpec(mermaidBlockConfig, {
  render: ({ block }) => (
    <div className="w-full rounded-md border bg-muted/20 p-3">
      <MermaidPreview code={block.props.code} />
    </div>
  ),
})
