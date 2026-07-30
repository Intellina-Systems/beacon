'use client'

import { Plug } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CopyableSnippet } from './agent-setup-card'

const MCP_URL = 'https://beacon-tool.vercel.app/api/mcp'
const CLAUDE_CODE_MCP = `claude mcp add --transport http beacon ${MCP_URL}`
const GENERIC_MCP_CONFIG = `{
  "mcpServers": {
    "beacon": {
      "url": "${MCP_URL}"
    }
  }
}`

// The "proper connector" surface: unlike AgentSetupCard's bcn_ key, this is
// OAuth-backed — adding the URL below prompts a real browser sign-in and
// consent screen (app/oauth/authorize), not a pasted secret. Read tools also
// still accept a bcn_ key for clients that don't do the OAuth dance; write
// tools require the OAuth connection, since a write needs a real member to
// attribute the change to.
export function McpConnectorCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4" />
          AI connector (MCP)
        </CardTitle>
        <CardDescription>
          Let Claude, Cursor, or another MCP client read and act on Beacon on your behalf. Adding the URL opens a
          browser sign-in and consent screen — no key to copy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Claude Code:</p>
          <CopyableSnippet text={CLAUDE_CODE_MCP} />
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Any other MCP-compatible client:</p>
          <CopyableSnippet text={GENERIC_MCP_CONFIG} />
        </div>
        <p className="text-xs text-muted-foreground">
          Manage or revoke a connection from your <span className="font-medium text-foreground">profile page</span>,
          under &ldquo;AI connections&rdquo;.
        </p>
      </CardContent>
    </Card>
  )
}
