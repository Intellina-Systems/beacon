'use client'

import { useRef, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Sparkles, Send, StopCircle, Bug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useBeaconChat } from '@/hooks/use-beacon-chat'
import { useResponseLevel } from '@/hooks/use-response-level'
import { ResponseLevelMenu } from './response-level-menu'
import { MessageBubble } from './message-bubble'
import { ThinkingBubble } from './thinking-bubble'

// Debug overlay is opened rarely (dev/debugging use) — keep it out of the
// initial chat bundle.
const ToolDebugPanel = dynamic(() => import('./tool-debug-panel').then((m) => m.ToolDebugPanel), { ssr: false })

const SUGGESTIONS = [
  {
    label: 'Give me recent changes on the platform and list teams and names worked on it.',
    message: 'Give me recent changes on the platform and list teams and names worked on it.',
  },
  { label: 'What happened this week?', message: 'What happened this week?' },
  { label: 'What is everyone working on?', message: 'What is everyone working on?' },
]

export function ChatConversation() {
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
      {showDebug && <ToolDebugPanel messages={messages} onClose={() => setShowDebug(false)} />}
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
                <Button
                  key={suggestion.label}
                  variant="outline"
                  onClick={() => sendMessage(suggestion.message, responseLevel)}
                  className="h-auto rounded-full px-3 py-1.5 text-xs font-normal"
                >
                  {suggestion.label}
                </Button>
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
