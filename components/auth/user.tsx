'use client'

import { SignOut } from './sign-out'
import { SignIn } from './sign-in'
import type { Session } from '@/lib/session/types'

type Role = 'admin' | 'manager' | 'engineer'

interface UserProps {
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  githubConnection: { connected: boolean; username: string | null }
  role: Role
  workspace: {
    id: string
    name: string
    teams: { id: string; name: string; isLead: boolean }[]
    memberships: { workspaceId: string; workspaceName: string }[]
  } | null
}

export function User({ user, authProvider, githubConnection, role, workspace }: UserProps) {
  if (user && authProvider) {
    return (
      <SignOut
        user={user}
        authProvider={authProvider}
        githubConnection={githubConnection}
        role={role}
        workspace={workspace}
      />
    )
  }
  return <SignIn />
}
