'use client'

import { useState } from 'react'
import { Bug, ChevronDown, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { resolveToolName, type AnyPart } from '@/lib/chat/tool-parts'
import type { UIMessage } from 'ai'

function ToolDebugEntry({
  index,
  toolName,
  input,
  output,
  state,
}: {
  index: number
  toolName: string
  input: unknown
  output: unknown
  state: string | undefined
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-lg border text-xs font-mono overflow-hidden">
      <Button
        variant="ghost"
        onClick={() => setExpanded((v) => !v)}
        className="h-auto w-full justify-between rounded-none px-3 py-2 font-normal hover:bg-muted/50"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground shrink-0">#{index + 1}</span>
          <span className="font-semibold text-foreground truncate">{toolName}</span>
          {state === 'input-streaming' && <span className="text-amber-500 shrink-0">running…</span>}
          {state === 'output-available' && <span className="text-green-500 shrink-0">done</span>}
        </div>
        <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform ml-2', !expanded && '-rotate-90')} />
      </Button>

      {expanded && (
        <div className="border-t divide-y">
          <div className="px-3 py-2">
            <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">Input</p>
            <pre className="text-foreground overflow-auto max-h-40 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(input, null, 2) ?? 'null'}
            </pre>
          </div>
          <div className="px-3 py-2">
            <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">Output</p>
            {output !== undefined ? (
              <pre className="text-foreground overflow-auto max-h-56 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify(output, null, 2)}
              </pre>
            ) : (
              <span className="text-muted-foreground italic text-[11px]">
                {state === 'input-streaming' ? 'pending…' : 'no output'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ToolDebugPanel({ messages, onClose }: { messages: UIMessage[]; onClose: () => void }) {
  const toolCalls = messages.flatMap((msg) =>
    msg.parts
      .filter((p) => p.type.startsWith('tool-') || p.type === 'dynamic-tool')
      .map((p) => {
        const part = p as AnyPart
        return {
          toolName: resolveToolName(part),
          input: part.input,
          output: part.output,
          state: part.state,
        }
      }),
  )

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[26rem] border-l bg-background z-50 flex flex-col shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Tool Debug</span>
          <Badge variant="secondary" className="text-xs">
            {toolCalls.length}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {toolCalls.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No tool calls yet.</p>
        ) : (
          toolCalls.map((tc, i) => <ToolDebugEntry key={i} index={i} {...tc} />)
        )}
      </div>
    </div>
  )
}
