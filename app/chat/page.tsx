'use client'

import { useRef, useEffect, useState } from 'react'
import { Sparkles, Send, StopCircle, SquarePen, Bug, X, ChevronDown, Gauge } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useBeaconChat } from '@/hooks/use-beacon-chat'
import {
  TeamDisplay,
  WorkItemsDisplay,
  BlockersDisplay,
  UnknownToolDisplay,
  ToolLoading,
} from '@/components/chat/tool-renderers'
import {
  RESPONSE_LEVELS,
  RESPONSE_LEVEL_LABELS,
  RESPONSE_LEVEL_DESCRIPTIONS,
  DEFAULT_RESPONSE_LEVEL,
  isResponseLevel,
  type ResponseLevel,
} from '@/lib/chat/response-level'
import type { UIMessage } from 'ai'

const RESPONSE_LEVEL_STORAGE_KEY = 'beacon:response-level'

function readStoredResponseLevel(): ResponseLevel {
  if (typeof window === 'undefined') return DEFAULT_RESPONSE_LEVEL
  const stored = window.localStorage.getItem(RESPONSE_LEVEL_STORAGE_KEY)
  return isResponseLevel(stored) ? stored : DEFAULT_RESPONSE_LEVEL
}

function useResponseLevel() {
  const [level, setLevel] = useState<ResponseLevel>(readStoredResponseLevel)

  function update(next: ResponseLevel) {
    setLevel(next)
    window.localStorage.setItem(RESPONSE_LEVEL_STORAGE_KEY, next)
  }

  return [level, update] as const
}

// ---------------------------------------------------------------------------
// Response-detail control — how much technical depth replies carry
// ---------------------------------------------------------------------------

function ResponseLevelMenu({ level, onChange }: { level: ResponseLevel; onChange: (level: ResponseLevel) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 flex-shrink-0" title="Response detail">
          <Gauge className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Response detail</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={level} onValueChange={(v) => onChange(v as ResponseLevel)}>
          {RESPONSE_LEVELS.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} className="cursor-pointer flex-col items-start gap-0">
              <span>{RESPONSE_LEVEL_LABELS[option]}</span>
              <span className="text-xs text-muted-foreground">{RESPONSE_LEVEL_DESCRIPTIONS[option]}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Debug panel — shows every tool call with its input + output
// ---------------------------------------------------------------------------

type AnyPart = { type: string; state?: string; input?: unknown; output?: unknown; toolCallId?: string }

function resolveToolName(part: AnyPart): string {
  if (part.type.startsWith('tool-')) return part.type.slice(5)
  if (part.type === 'dynamic-tool') return (part as { toolName?: string }).toolName ?? 'unknown'
  return part.type
}

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
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground shrink-0">#{index + 1}</span>
          <span className="font-semibold text-foreground truncate">{toolName}</span>
          {state === 'input-streaming' && <span className="text-amber-500 shrink-0">running…</span>}
          {state === 'output-available' && <span className="text-green-500 shrink-0">done</span>}
        </div>
        <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform ml-2', !expanded && '-rotate-90')} />
      </button>

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

function DebugPanel({ messages, onClose }: { messages: UIMessage[]; onClose: () => void }) {
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

function ToolPartRenderer({ part }: { part: AnyPart }) {
  const toolName = resolveToolName(part)

  if (part.state === 'input-streaming') {
    return <ToolLoading label={`Running ${toolName}…`} />
  }

  const output = part.state === 'output-available' ? part.output : undefined

  if (part.type === 'tool-display_team') {
    return <TeamDisplay output={output as Parameters<typeof TeamDisplay>[0]['output']} />
  }
  if (part.type === 'tool-display_work_items') {
    return <WorkItemsDisplay output={output as Parameters<typeof WorkItemsDisplay>[0]['output']} />
  }
  if (part.type === 'tool-get_blockers') {
    return <BlockersDisplay output={output as Parameters<typeof BlockersDisplay>[0]['output']} />
  }

  if (output !== undefined) return null // known tool ran, no custom renderer → suppress

  return <UnknownToolDisplay toolName={toolName} input={part.input} />
}

// ---------------------------------------------------------------------------
// Thinking indicator
// ---------------------------------------------------------------------------

function ThinkingBubble() {
  return (
    <div className="flex gap-3">
      <div className="h-7 w-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="h-3.5 w-3.5 text-background" />
      </div>
      <div className="rounded-2xl bg-muted px-4 py-3 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single message renderer
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'justify-end')}>
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="h-3.5 w-3.5 text-background" />
        </div>
      )}

      <div className={cn('flex flex-col gap-2 max-w-[85%]', isUser && 'items-end')}>
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            if (!isUser) {
              return (
                <div key={i} className="rounded-2xl bg-muted px-4 py-3 text-foreground">
                  <Streamdown
                    className="text-sm leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_pre]:max-w-full"
                    controls
                    isAnimating={part.state === 'streaming'}
                  >
                    {part.text}
                  </Streamdown>
                </div>
              )
            }

            return (
              <div
                key={i}
                className="rounded-2xl bg-foreground px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-background"
              >
                {part.text}
                {part.state === 'streaming' && (
                  <span className="inline-block w-1.5 h-3.5 bg-current opacity-70 animate-pulse ml-0.5 align-[-1px]" />
                )}
              </div>
            )
          }

          if (part.type === 'reasoning') {
            return (
              <div key={i} className="text-xs text-muted-foreground italic px-1">
                {part.text}
              </div>
            )
          }

          // Tool parts
          if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
            return (
              <div key={i} className="w-full">
                <ToolPartRenderer part={part as AnyPart} />
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  {
    label: 'Give me recent changes on the platform and list teams and names worked on it.',
    message: 'Give me recent changes on the platform and list teams and names worked on it.',
  },
  { label: 'What happened this week?', message: 'What happened this week?' },
  { label: 'What is everyone working on?', message: 'What is everyone working on?' },
]

function ChatConversation() {
  const { messages, status, sendMessage, stop } = useBeaconChat()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [responseLevel, setResponseLevel] = useResponseLevel()

  const isStreaming = status === 'streaming' || status === 'submitted'

  const toolCallCount = messages.reduce(
    (n, m) => n + m.parts.filter((p) => p.type.startsWith('tool-') || p.type === 'dynamic-tool').length,
    0,
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const text = (e.currentTarget.value ?? '').trim()
      if (text && !isStreaming) {
        sendMessage(text, responseLevel)
        e.currentTarget.value = ''
      }
    }
  }

  function handleSend() {
    const text = inputRef.current?.value.trim() ?? ''
    if (text && !isStreaming) {
      sendMessage(text, responseLevel)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      {showDebug && <DebugPanel messages={messages} onClose={() => setShowDebug(false)} />}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Ask Beacon</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                It already knows what&apos;s happening — work, code, agents, CI, and knowledge, all in one stream.
              </p>
            </div>
            <div className="flex max-w-sm flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.label}
                  onClick={() => sendMessage(suggestion.message, responseLevel)}
                  className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {status === 'submitted' && <ThinkingBubble />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t bg-background px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            ref={inputRef}
            onKeyDown={handleKeyDown}
            placeholder="What's happening?"
            rows={1}
            className="max-h-40 min-h-[40px] resize-none overflow-y-auto py-2.5 text-sm"
            disabled={isStreaming}
          />
          <ResponseLevelMenu level={responseLevel} onChange={setResponseLevel} />
          <Button
            variant={showDebug ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setShowDebug((v) => !v)}
            className="h-10 w-10 flex-shrink-0 relative"
            title="Toggle tool debug panel"
          >
            <Bug className="h-4 w-4" />
            {toolCallCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
                {toolCallCount > 9 ? '9+' : toolCallCount}
              </span>
            )}
          </Button>
          {isStreaming ? (
            <Button variant="outline" size="icon" onClick={stop} className="h-10 w-10 flex-shrink-0">
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={handleSend} className="h-10 w-10 flex-shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">Enter to send · Shift+Enter for new line</p>
      </div>
    </>
  )
}

export default function ChatPage() {
  const [chatKey, setChatKey] = useState(0)

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 lg:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">Ask Beacon</h1>
          <p className="hidden truncate text-[13px] text-muted-foreground md:block">
            Grounded in your live engineering event stream
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setChatKey((k) => k + 1)}
          title="New chat"
        >
          <SquarePen className="h-4 w-4" />
        </Button>
      </header>

      <ChatConversation key={chatKey} />
    </div>
  )
}
