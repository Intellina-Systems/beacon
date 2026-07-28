'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SquarePen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChatConversation } from './chat-conversation'

export function ChatPageClient() {
  const [chatKey, setChatKey] = useState(0)
  const searchParams = useSearchParams()

  // Opened from a team or engine page: answer from that unit's documents only.
  const engineId = searchParams.get('engineId')
  const teamId = searchParams.get('teamId')
  const scopeLabel = searchParams.get('scopeLabel')
  const scoped = Boolean(engineId || teamId)

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 lg:px-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">Ask Beacon</h1>
          {scoped ? (
            <Badge variant="secondary" className="shrink-0 text-[11px] font-normal">
              {scopeLabel ? `Scoped to ${scopeLabel}` : 'Scoped to one team'}
            </Badge>
          ) : (
            <p className="hidden truncate text-[13px] text-muted-foreground md:block">
              Grounded in your live engineering event stream
            </p>
          )}
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

      <ChatConversation key={chatKey} scope={scoped ? { engineId, teamId } : undefined} />
    </div>
  )
}
