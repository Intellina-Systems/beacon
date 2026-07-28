'use client'

import { useState } from 'react'
import { SquarePen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatConversation } from './chat-conversation'

export function ChatPageClient() {
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
