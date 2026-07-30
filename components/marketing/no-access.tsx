'use client'

import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { redirectToSignOut } from '@/lib/session/redirect-to-sign-out'

/**
 * Signed in, but a member of nothing. The gate in the OAuth callbacks means
 * this is a dead end rather than a normal state — it exists so the app never
 * bounces such a visitor between `/` and an app page forever.
 */
export function NoAccess({ username }: { username: string }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6 text-center shadow-sm">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-beacon">
          <Zap className="h-5 w-5 text-beacon-foreground" strokeWidth={2.5} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">No workspace access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">@{username}</span> isn&apos;t a member of any Beacon
            workspace. Ask an admin to invite you, then use the link they send.
          </p>
        </div>
        <Button variant="outline" className="w-full" onClick={() => redirectToSignOut()}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
