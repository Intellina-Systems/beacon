'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
}

export function ChatHistoryMenu({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null)

  async function load() {
    const res = await fetch('/api/chat/conversations')
    if (!res.ok) return
    const data = (await res.json()) as { conversations: ConversationSummary[] }
    setConversations(data.conversations)
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && void load()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Chat history">
          <History className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {conversations === null ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>
        ) : conversations.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No past conversations yet</div>
        ) : (
          conversations.map((conversation) => (
            <DropdownMenuItem
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={conversation.id === activeId ? 'bg-accent' : undefined}
            >
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate text-sm">{conversation.title || 'New chat'}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  <RelativeTime date={new Date(conversation.updatedAt)} />
                </span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
