'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SquarePen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { generateId } from '@/lib/utils/id'
import { ChatConversation } from './chat-conversation'
import { ChatHistoryMenu } from './chat-history-menu'

export function ChatPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Opened from a team or engine page: answer from that unit's documents only.
  const engineId = searchParams.get('engineId')
  const teamId = searchParams.get('teamId')
  const scopeLabel = searchParams.get('scopeLabel')
  const scoped = Boolean(engineId || teamId)

  const [conversationId, setConversationId] = useState(() => searchParams.get('c') ?? generateId())

  function updateUrl(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('c', id)
    router.replace(`/chat?${params.toString()}`, { scroll: false })
  }

  // The very first conversationId — generated locally when the page loads
  // without a ?c= param — never makes it into the URL on its own; without
  // this, refreshing (or bookmarking) that first message loses it, since
  // there'd be nothing in the URL to resume and a fresh id gets minted again.
  useEffect(() => {
    if (!searchParams.get('c')) updateUrl(conversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only meant to backfill the URL once per mount, not react to every searchParams change
  }, [])

  function startNewChat() {
    const id = generateId()
    setConversationId(id)
    updateUrl(id)
  }

  function openConversation(id: string) {
    setConversationId(id)
    updateUrl(id)
  }

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
        <div className="flex shrink-0 items-center gap-1">
          <ChatHistoryMenu activeId={conversationId} onSelect={openConversation} />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startNewChat} title="New chat">
            <SquarePen className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <ChatConversation
        key={conversationId}
        conversationId={conversationId}
        scope={scoped ? { engineId, teamId } : undefined}
      />
    </div>
  )
}
