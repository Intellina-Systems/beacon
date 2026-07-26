'use client'

import { Github } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function ConnectionsCard({
  githubConnected,
  githubUsername,
}: {
  githubConnected: boolean
  githubUsername: string | null
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Connections</CardTitle>
        <CardDescription>Provider accounts Beacon can pull signals through.</CardDescription>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-3">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4" />
            <div>
              <p className="text-sm font-medium">GitHub</p>
              <p className="text-xs text-muted-foreground">
                {githubConnected ? `@${githubUsername}` : 'Not connected'}
              </p>
            </div>
          </div>
          {githubConnected ? (
            <Badge variant="outline">Connected</Badge>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <a href="/api/auth/github/signin?returnTo=/integrations">Connect</a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
