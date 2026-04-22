'use client'

import { useRef, useEffect } from 'react'
import { Sparkles, Send, StopCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useBeaconChat } from '@/hooks/use-beacon-chat'
import {
  ProjectsDisplay,
  TeamDisplay,
  WorkItemsDisplay,
  UnknownToolDisplay,
  ToolLoading,
} from '@/components/chat/tool-renderers'
import type { UIMessage } from 'ai'

// ---------------------------------------------------------------------------
// Tool part renderer — maps tool name → component
// ---------------------------------------------------------------------------

type AnyPart = { type: string; state?: string; input?: unknown; output?: unknown; toolCallId?: string }

function ToolPartRenderer({ part }: { part: AnyPart }) {
  const toolName = part.type.startsWith('tool-')
    ? part.type.slice(5)
    : part.type === 'dynamic-tool'
      ? ((part as { toolName?: string }).toolName ?? 'unknown')
      : ''

  if (part.state === 'input-streaming') {
    return <ToolLoading label={`Running ${toolName}…`} />
  }

  const output = part.state === 'output-available' ? part.output : undefined

  if (part.type === 'tool-display_projects') {
    return <ProjectsDisplay output={output as Parameters<typeof ProjectsDisplay>[0]['output']} />
  }
  if (part.type === 'tool-display_team') {
    return <TeamDisplay output={output as Parameters<typeof TeamDisplay>[0]['output']} />
  }
  if (part.type === 'tool-display_work_items') {
    return <WorkItemsDisplay output={output as Parameters<typeof WorkItemsDisplay>[0]['output']} />
  }

  if (output !== undefined) return null // known tool ran, no custom renderer → suppress

  return <UnknownToolDisplay toolName={toolName} input={part.input} />
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
            return (
              <div
                key={i}
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                  isUser ? 'bg-foreground text-background' : 'bg-muted text-foreground',
                )}
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

export default function ChatPage() {
  const { messages, status, sendMessage, stop } = useBeaconChat()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const isStreaming = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const text = (e.currentTarget.value ?? '').trim()
      if (text && !isStreaming) {
        sendMessage(text)
        e.currentTarget.value = ''
      }
    }
  }

  function handleSend() {
    const text = inputRef.current?.value.trim() ?? ''
    if (text && !isStreaming) {
      sendMessage(text)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Beacon AI</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Ask about your projects, team capacity, blockers, or anything on your plate.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-sm">
              {['Show my projects', 'Who has capacity?', 'What are the blockers?'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(suggestion)}
                  className="text-xs px-3 py-1.5 rounded-full border hover:bg-accent transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t bg-background px-4 py-4">
        <div className="max-w-2xl mx-auto flex gap-2 items-end">
          <Textarea
            ref={inputRef}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything…"
            rows={1}
            className="resize-none min-h-[40px] max-h-40 overflow-y-auto py-2.5 text-sm"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button variant="outline" size="icon" onClick={stop} className="flex-shrink-0 h-10 w-10">
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={handleSend} className="flex-shrink-0 h-10 w-10">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
