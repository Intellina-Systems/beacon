'use client'

import { useRouter } from 'next/navigation'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RelativeTime } from '@/components/ui/relative-time'

export interface McpGrantRow {
  id: string
  clientName: string
  memberName: string
  scope: string
  lastUsedAt: string | null
  createdAt: string
}

// Read-only oversight, not the primary way a connection gets managed — each
// member manages their own on their profile page (McpConnectionsCard). This
// exists so an admin can see everything connected workspace-wide and cut one
// off for incident response, same as how a GitHub/Slack org admin panel
// shows every member's OAuth grants even though members create them personally.
export function McpGrantsAdminTable({ grants }: { grants: McpGrantRow[] }) {
  const router = useRouter()

  async function revoke(id: string) {
    const res = await fetch(`/api/oauth/grants/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Connection revoked')
      router.refresh()
    } else {
      toast.error('Failed to revoke')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          AI connections — workspace
        </CardTitle>
        <CardDescription>Every MCP connection active in this workspace, across all members.</CardDescription>
      </CardHeader>
      <CardContent>
        {grants.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No AI clients are connected to this workspace.</p>
        ) : (
          <div className="divide-y">
            {grants.map((g) => (
              <div key={g.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {g.clientName} <span className="font-normal text-muted-foreground">— {g.memberName}</span>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {g.scope}
                    <span className="font-sans">
                      {' · '}
                      {g.lastUsedAt ? <RelativeTime date={g.lastUsedAt} prefix="used " /> : 'never used'}
                    </span>
                  </p>
                </div>
                <Badge variant="outline">Active</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => revoke(g.id)}
                  title="Revoke"
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
