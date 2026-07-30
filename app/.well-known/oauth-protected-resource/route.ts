import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler'
import type { NextRequest } from 'next/server'

// RFC 9728 — tells an MCP client which Authorization Server issues valid
// tokens for /api/mcp. Beacon is both the resource server and the AS here,
// so authServerUrls points at its own origin. resourceUrl is set explicitly
// rather than left to mcp-handler's auto-detection, which would otherwise
// derive it from this route's own URL rather than the MCP endpoint it's
// actually describing.
export function GET(req: NextRequest): Response {
  const origin = req.nextUrl.origin
  return protectedResourceHandler({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp`,
  })(req)
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
