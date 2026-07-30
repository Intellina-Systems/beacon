'use client'

import { useRouter } from 'next/navigation'
import { Plug, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RelativeTime } from '@/components/ui/relative-time'

export interface McpConnectionRow {
  id: string
  clientName: string
  scope: string
  lastUsedAt: string | null
  createdAt: string
}

// Unlike ApiKeysCard, there's no "New connection" button here — an MCP
// connection is created by an AI client's own OAuth flow (Claude Code's
// `/mcp add`, Claude Desktop/ChatGPT's connector UI), never clicked into
// existence from this page. This card is purely list-and-revoke.
export function McpConnectionsCard({ connections }: { connections: McpConnectionRow[] }) {
  const router = useRouter()

  async function revoke(id: string) {
    const res = await fetch(`/api/oauth/grants/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Connection disconnected')
      router.refresh()
    } else {
      toast.error('Failed to disconnect')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4" />
          AI connections
        </CardTitle>
        <CardDescription>AI clients (Claude, Cursor…) authorized to act as you over MCP.</CardDescription>
      </CardHeader>
      <CardContent>
        {connections.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No connections yet. Add Beacon as an MCP connector in Claude, Cursor, or another MCP client and authorize it
            here.
          </p>
        ) : (
          <div className="divide-y">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.clientName}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {c.scope}
                    <span className="font-sans">
                      {' · '}
                      {c.lastUsedAt ? <RelativeTime date={c.lastUsedAt} prefix="used " /> : 'never used'}
                    </span>
                  </p>
                </div>
                <Badge variant="outline">Active</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => revoke(c.id)}
                  title="Disconnect"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
