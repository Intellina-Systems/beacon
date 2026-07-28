'use client'

import { useState } from 'react'
import { DEFAULT_RESPONSE_LEVEL, isResponseLevel, type ResponseLevel } from '@/lib/chat/response-level'

const RESPONSE_LEVEL_STORAGE_KEY = 'beacon:response-level'

function readStoredResponseLevel(): ResponseLevel {
  if (typeof window === 'undefined') return DEFAULT_RESPONSE_LEVEL
  const stored = window.localStorage.getItem(RESPONSE_LEVEL_STORAGE_KEY)
  return isResponseLevel(stored) ? stored : DEFAULT_RESPONSE_LEVEL
}

export function useResponseLevel() {
  const [level, setLevel] = useState<ResponseLevel>(readStoredResponseLevel)

  function update(next: ResponseLevel) {
    setLevel(next)
    window.localStorage.setItem(RESPONSE_LEVEL_STORAGE_KEY, next)
  }

  return [level, update] as const
}
