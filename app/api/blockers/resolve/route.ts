import { z } from 'zod'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canViewAllTeams, detailVisibleMemberIds } from '@/lib/auth/permissions'
import { ingestEvents } from '@/lib/events/ingest'

const schema = z.object({
  workItemId: z.string().optional().nullable(),
  workItemKey: z.string().optional().nullable(),
  memberId: z.string().optional().nullable(),
  memberName: z.string().optional().nullable(),
  actorLabel: z.string().optional().nullable(),
  summary: z.string().max(200).optional(),
})

// Resolve a Pulse blocker by appending an unblocking event in the same scope
// (work item, or actor). getActiveBlockers pairs blocking/unblocking events, so
// this clears it; a linked work item also moves off "blocked" (task.unblocked →
// in_progress via statusEffectOf).
export async function POST(req: Request): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })
  const d = parsed.data

  // Permission: managers/admins can resolve anyone's; leads can resolve their
  // team's; everyone can resolve their own. Unattributed blockers → managers.
  if (d.memberId) {
    const scoped = await detailVisibleMemberIds(ctx)
    if (scoped && !scoped.includes(d.memberId)) return Response.json({ error: 'Forbidden' }, { status: 403 })
  } else if (!canViewAllTeams(ctx)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  await ingestEvents(
    [
      {
        type: 'task.unblocked',
        source: 'manual',
        task: d.workItemId ?? d.workItemKey ?? undefined,
        engineer: d.memberName ?? d.actorLabel ?? undefined,
        summary: (d.summary ?? 'Blocker resolved').slice(0, 200),
        occurredAt: new Date(),
      },
    ],
    { workspaceId: ctx.workspaceId, defaultSource: 'manual' },
  )

  return Response.json({ ok: true })
}
