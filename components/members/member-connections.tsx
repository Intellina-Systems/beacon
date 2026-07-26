'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Github, Link2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function MemberConnections({ memberId, githubUsername }: { memberId: string; githubUsername: string | null }) {
  const router = useRouter()
  const [saving, setSaving] = useState<'github' | null>(null)

  const [githubValue, setGithubValue] = useState(githubUsername ?? '')

  async function patch(body: Record<string, string | null>) {
    const res = await fetch(`/api/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) router.refresh()
  }

  async function saveGithub() {
    setSaving('github')
    try {
      await patch({ githubUsername: githubValue.trim() || null })
    } finally {
      setSaving(null)
    }
  }

  async function disconnectGithub() {
    setSaving('github')
    try {
      setGithubValue('')
      await patch({ githubUsername: null })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Github className="h-4 w-4" />
            GitHub
          </CardTitle>
          <CardDescription>{githubUsername ? `Connected as @${githubUsername}` : 'Not connected'}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Username</Label>
            <Input
              className="h-8 text-sm"
              placeholder="githubhandle"
              value={githubValue}
              onChange={(e) => setGithubValue(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={saveGithub}
              disabled={saving === 'github' || githubValue.trim() === (githubUsername ?? '')}
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              {saving === 'github' ? 'Saving…' : 'Connect'}
            </Button>
            {githubUsername && (
              <Button
                size="sm"
                variant="ghost"
                onClick={disconnectGithub}
                disabled={saving === 'github'}
                className="text-muted-foreground"
              >
                <Unlink className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
