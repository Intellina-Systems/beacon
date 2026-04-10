'use client'

import { useRef, useState, useEffect } from 'react'
import { Sparkles, Send, StopCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

let msgCount = 0
function nextId() {
  return `msg-${++msgCount}`
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function submit() {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMsg: Message = { id: nextId(), role: 'user', content: text }
    const assistantId = nextId()
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '' }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })),
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
        )
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: 'Something went wrong. Please try again.' } : m,
          ),
        )
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Beacon AI</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Ask me about your projects, priorities, team capacity, or anything else on your plate.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {messages.map((m) => (
              <div key={m.id} className={cn('flex gap-3', m.role === 'user' && 'justify-end')}>
                {m.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="h-3.5 w-3.5 text-background" />
                  </div>
                )}
                <div
                  className={cn(
                    'rounded-2xl px-4 py-2.5 text-sm leading-relaxed max-w-[80%] whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-foreground',
                  )}
                >
                  {m.content}
                  {m.role === 'assistant' && isStreaming && m.id === messages[messages.length - 1]?.id && (
                    <span className="inline-block w-1.5 h-3.5 bg-current opacity-70 animate-pulse ml-0.5 align-[-1px]" />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t bg-background px-4 py-4">
        <div className="max-w-2xl mx-auto flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
            <Button size="icon" onClick={submit} disabled={!input.trim()} className="flex-shrink-0 h-10 w-10">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for a new line
        </p>
      </div>
    </div>
  )
}
