'use client'

import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { FolderKanban, Sparkles, Send, StopCircle } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

function ChatConversation({ productId }: { productId: string | null }) {
  const { messages, status, sendMessage, stop } = useBeaconChat(productId)
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
      if (text && !isStreaming && productId) {
        sendMessage(text)
        e.currentTarget.value = ''
      }
    }
  }

  function handleSend() {
    const text = inputRef.current?.value.trim() ?? ''
    if (text && !isStreaming && productId) {
      sendMessage(text)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">Beacon AI</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {productId
                  ? 'Ask about this product, its work, code activity, blockers, or anything on your plate.'
                  : 'Create or select a product before asking Beacon AI.'}
              </p>
            </div>
            {productId && (
              <div className="flex max-w-sm flex-wrap justify-center gap-2">
                {['Show active work', 'What changed in GitHub?', 'What are the blockers?'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion)}
                    className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t bg-background px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <Textarea
            ref={inputRef}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="max-h-40 min-h-[40px] resize-none overflow-y-auto py-2.5 text-sm"
            disabled={isStreaming || !productId}
          />
          {isStreaming ? (
            <Button variant="outline" size="icon" onClick={stop} className="h-10 w-10 flex-shrink-0">
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={handleSend} className="h-10 w-10 flex-shrink-0" disabled={!productId}>
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
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([])
  const [productId, setProductId] = useState<string | null>(null)

  useEffect(() => {
    const storedProductId = window.localStorage.getItem('beacon:selected-product-id')

    async function loadProducts() {
      const response = await fetch('/api/products')
      if (!response.ok) return
      const data = (await response.json()) as { products: Array<{ id: string; name: string }> }
      setProducts(data.products)
      const selected = data.products.find((product) => product.id === storedProductId) ?? data.products[0] ?? null
      if (selected) {
        setProductId(selected.id)
        window.localStorage.setItem('beacon:selected-product-id', selected.id)
      }
    }

    void loadProducts()
  }, [])

  function handleProductChange(value: string) {
    setProductId(value)
    window.localStorage.setItem('beacon:selected-product-id', value)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-background px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Beacon AI</p>
            <p className="text-xs text-muted-foreground">Answers stay scoped to the selected product.</p>
          </div>
          {products.length > 0 ? (
            <Select value={productId ?? undefined} onValueChange={handleProductChange}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href="/projects">
                <FolderKanban className="h-4 w-4 mr-2" />
                Create Product
              </Link>
            </Button>
          )}
        </div>
      </div>

      <ChatConversation key={productId ?? 'no-product'} productId={productId} />
    </div>
  )
}
