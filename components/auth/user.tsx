'use client'

import { SignOut } from './sign-out'
import { SignIn } from './sign-in'
import type { Session } from '@/lib/session/types'

interface UserProps {
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  githubConnection: { connected: boolean; username: string | null }
}

export function User({ user, authProvider, githubConnection }: UserProps) {
  if (user && authProvider) {
    return <SignOut user={user} authProvider={authProvider} githubConnection={githubConnection} />
  }
  return <SignIn />
}
