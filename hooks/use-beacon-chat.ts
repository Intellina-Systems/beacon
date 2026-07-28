'use client'

import { useState, useSyncExternalStore, useCallback } from 'react'
import { AbstractChat, DefaultChatTransport } from 'ai'
import type { UIMessage, ChatState, ChatStatus } from 'ai'
import type { ResponseLevel } from '@/lib/chat/response-level'

// ---------------------------------------------------------------------------
// Reactive ChatState implementation
// AbstractChat mutates state.status, state.error, and state.messages directly,
// and also calls pushMessage / popMessage / replaceMessage.
// We proxy all writes and method calls to trigger React re-renders.
// ---------------------------------------------------------------------------

function createReactiveChatState(): {
  state: ChatState<UIMessage>
  subscribe: (l: () => void) => () => void
  getSnapshot: () => number
} {
  const listeners = new Set<() => void>()
  let version = 0

  function notify() {
    version++
    for (const l of listeners) l()
  }

  const raw: {
    status: ChatStatus
    error: Error | undefined
    messages: UIMessage[]
  } = {
    status: 'ready',
    error: undefined,
    messages: [],
  }

  // Proxy intercepts direct property writes (status, error, messages)
  const state = new Proxy(
    {
      get status() {
        return raw.status
      },
      get error() {
        return raw.error
      },
      get messages() {
        return raw.messages
      },
      set status(v: ChatStatus) {
        raw.status = v
        notify()
      },
      set error(v: Error | undefined) {
        raw.error = v
        notify()
      },
      set messages(v: UIMessage[]) {
        raw.messages = v
        notify()
      },
      pushMessage(msg: UIMessage) {
        raw.messages = [...raw.messages, msg]
        notify()
      },
      popMessage() {
        raw.messages = raw.messages.slice(0, -1)
        notify()
      },
      replaceMessage(index: number, msg: UIMessage) {
        const next = [...raw.messages]
        next[index] = msg
        raw.messages = next
        notify()
      },
      snapshot<T>(thing: T): T {
        return thing
      },
    } as ChatState<UIMessage>,
    {
      set(target, prop, value) {
        const didSet = Reflect.set(target, prop, value)
        if (prop === 'status' || prop === 'error' || prop === 'messages') notify()
        return didSet
      },
    },
  ) as ChatState<UIMessage>

  return {
    state,
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getSnapshot: () => version,
  }
}

// ---------------------------------------------------------------------------
// Concrete subclass — AbstractChat is abstract in TS but has no abstract methods
// ---------------------------------------------------------------------------

class BeaconChat extends AbstractChat<UIMessage> {
  constructor(state: ChatState<UIMessage>) {
    super({
      state,
      transport: new DefaultChatTransport({ api: '/api/chat' }),
    })
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Restricts knowledge retrieval to one team's or engine's documents. */
export interface ChatScope {
  engineId?: string | null
  teamId?: string | null
}

export function useBeaconChat(scope?: ChatScope) {
  const [store] = useState(() => createReactiveChatState())
  const [chat] = useState(() => new BeaconChat(store.state))
  const { subscribe, getSnapshot } = store

  // Subscribe so React re-renders whenever state changes
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Depend on the ids, not the object, so a fresh literal each render doesn't
  // rebuild sendMessage on every pass.
  const engineId = scope?.engineId ?? null
  const teamId = scope?.teamId ?? null

  const sendMessage = useCallback(
    (text: string, responseLevel?: ResponseLevel) => {
      const body: Record<string, unknown> = {}
      if (responseLevel) body.responseLevel = responseLevel
      if (engineId || teamId) body.scope = { engineId, teamId }
      void chat.sendMessage({ text }, Object.keys(body).length > 0 ? { body } : undefined)
    },
    [chat, engineId, teamId],
  )

  const stop = useCallback(() => {
    void chat.stop()
  }, [chat])

  return {
    messages: chat.messages as UIMessage[],
    status: chat.status,
    error: chat.error,
    sendMessage,
    stop,
  }
}
