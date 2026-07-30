import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { verifyMcpToken } from '@/lib/mcp/auth'
import { registerQueryEventsTool } from '@/lib/mcp/tools/query-events'
import { registerListWorkItemsTool } from '@/lib/mcp/tools/list-work-items'
import { registerGetWorkItemTool } from '@/lib/mcp/tools/get-work-item'
import { registerGetBlockersTool } from '@/lib/mcp/tools/get-blockers'
import { registerSearchKnowledgeTool } from '@/lib/mcp/tools/search-knowledge'
import { registerListProjectsTool } from '@/lib/mcp/tools/list-projects'
import { registerListTeamsTool } from '@/lib/mcp/tools/list-teams'
import { registerListMembersTool } from '@/lib/mcp/tools/list-members'
import { registerCreateWorkItemTool } from '@/lib/mcp/tools/create-work-item'
import { registerUpdateWorkItemTool } from '@/lib/mcp/tools/update-work-item'
import { registerAddCommentTool } from '@/lib/mcp/tools/add-comment'
import { registerAddRelationTool } from '@/lib/mcp/tools/add-relation'

// The MCP tool server. mcp-handler 2.x is stateless — one handler invocation
// per request, no session/Redis — so this file only ever registers tools;
// mounting it at this route (app/api/mcp) rather than passing a basePath is
// how 2.x expects the route to be wired (basePath is deprecated/ignored).
const handler = createMcpHandler(
  (server) => {
    registerQueryEventsTool(server)
    registerListWorkItemsTool(server)
    registerGetWorkItemTool(server)
    registerGetBlockersTool(server)
    registerSearchKnowledgeTool(server)
    registerListProjectsTool(server)
    registerListTeamsTool(server)
    registerListMembersTool(server)
    registerCreateWorkItemTool(server)
    registerUpdateWorkItemTool(server)
    registerAddCommentTool(server)
    registerAddRelationTool(server)
  },
  { serverInfo: { name: 'beacon', version: '1.0.0' } },
)

// required: true — every call must carry a bearer token that verifyMcpToken
// resolves (an MCP access token or a legacy bcn_ key); resourceMetadataPath
// points MCP clients at the .well-known endpoint that in turn advertises
// Beacon's own OAuth authorization server (Phase 4).
const authedHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource',
})

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE }
