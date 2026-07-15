'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Github, Link2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type LinearUser = { id: string; name: string }

export function MemberConnections({
  memberId,
  githubUsername,
  linearUserId,
  linearUserName,
  availableLinearUsers,
}: {
  memberId: string
  githubUsername: string | null
  linearUserId: string | null
  linearUserName: string | null
  availableLinearUsers: LinearUser[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState<'linear' | 'github' | null>(null)

  const [linearValue, setLinearValue] = useState(linearUserId ?? '')
  const [githubValue, setGithubValue] = useState(githubUsername ?? '')

  async function patch(body: Record<string, string | null>) {
    const res = await fetch(`/api/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) router.refresh()
  }

  async function saveLinear() {
    setSaving('linear')
    try {
      await patch({ linearUserId: linearValue || null })
    } finally {
      setSaving(null)
    }
  }

  async function disconnectLinear() {
    setSaving('linear')
    try {
      setLinearValue('')
      await patch({ linearUserId: null })
    } finally {
      setSaving(null)
    }
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
            <svg className="h-4 w-4" viewBox="0 0 100 100" fill="currentColor">
              <path d="M50 5C25.1 5 5 25.1 5 50c0 22.1 14.4 40.9 34.4 47.6 2.5.5 3.4-1.1 3.4-2.4 0-1.2 0-4.3-.1-8.4-14 3-17-6.7-17-6.7-2.3-5.8-5.6-7.4-5.6-7.4-4.6-3.1.3-3 .3-3 5 .3 7.7 5.2 7.7 5.2 4.5 7.7 11.7 5.5 14.6 4.2.5-3.3 1.7-5.5 3.2-6.8-11.2-1.3-22.9-5.6-22.9-24.8 0-5.5 2-10 5.2-13.5-.5-1.3-2.3-6.4.5-13.3 0 0 4.2-1.3 13.8 5.1 4-1.1 8.3-1.7 12.5-1.7s8.5.6 12.5 1.7c9.6-6.5 13.8-5.1 13.8-5.1 2.8 6.9 1 12 .5 13.3 3.2 3.5 5.2 8 5.2 13.5 0 19.3-11.7 23.5-22.9 24.8 1.8 1.5 3.4 4.6 3.4 9.3 0 6.7-.1 12.1-.1 13.7 0 1.3.9 2.9 3.5 2.4C80.6 90.9 95 72.1 95 50 95 25.1 74.9 5 50 5z" />
            </svg>
            Linear
          </CardTitle>
          <CardDescription>
            {linearUserId ? `Connected as ${linearUserName ?? linearUserId}` : 'Not connected'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {availableLinearUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Connect Linear in Integrations to see workspace members.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Workspace member</Label>
                <Select value={linearValue} onValueChange={setLinearValue}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Pick a workspace member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLinearUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={saveLinear}
                  disabled={saving === 'linear' || linearValue === (linearUserId ?? '')}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                  {saving === 'linear' ? 'Saving…' : 'Connect'}
                </Button>
                {linearUserId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={disconnectLinear}
                    disabled={saving === 'linear'}
                    className="text-muted-foreground"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
