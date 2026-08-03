import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { signalSources, SIGNAL_SOURCE_KINDS } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { generateId } from '@/lib/utils/id'
import { registerRepoWebhook } from '@/lib/github/repo-webhook'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const rows = await db
    .select()
    .from(signalSources)
    .where(eq(signalSources.workspaceId, ctx.workspaceId))
    .orderBy(desc(signalSources.createdAt))

  return Response.json({ sources: rows })
}

const createSchema = z.object({
  kind: z.enum(SIGNAL_SOURCE_KINDS),
  identifier: z.string().min(1).max(300),
  displayName: z.string().min(1).max(200),
  url: z.string().url().optional(),
  projectId: z.string().optional(),
})

export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(ctx)) return forbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid source', issues: parsed.error.issues }, { status: 400 })
  }

  const [source] = await db
    .insert(signalSources)
    .values({ id: generateId(), workspaceId: ctx.workspaceId, ...parsed.data })
    .onConflictDoUpdate({
      target: [signalSources.workspaceId, signalSources.kind, signalSources.identifier],
      set: { displayName: parsed.data.displayName, enabled: true, updatedAt: new Date() },
    })
    .returning()

  // Fast-path for near-real-time linking; the hourly cron sync remains the
  // reconciliation backstop regardless of whether this succeeds (see
  // lib/github/repo-webhook.ts).
  if (source.kind === 'github_repo' && !(source.config as { webhookId?: number } | null)?.webhookId) {
    const origin = new URL(req.url).origin
    const webhookConfig = await registerRepoWebhook(ctx.workspaceId, source.identifier, `${origin}/api/webhooks/github`)
    if (webhookConfig) {
      const [updated] = await db
        .update(signalSources)
        .set({ config: { ...webhookConfig }, updatedAt: new Date() })
        .where(eq(signalSources.id, source.id))
        .returning()
      return Response.json({ source: updated }, { status: 201 })
    }
  }

  return Response.json({ source }, { status: 201 })
}
