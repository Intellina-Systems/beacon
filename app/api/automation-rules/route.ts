import { asc, eq } from 'drizzle-orm'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import {
  automationRules,
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_CONDITION_OPS,
} from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canManageWorkspaceConfig, forbidden } from '@/lib/auth/permissions'
import { generateId } from '@/lib/utils/id'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageWorkspaceConfig(ctx)) return forbidden()

  const rows = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.workspaceId, ctx.workspaceId))
    .orderBy(asc(automationRules.name))
  return Response.json({ rules: rows })
}

const conditionSchema = z.object({
  field: z.enum(AUTOMATION_CONDITION_FIELDS),
  op: z.enum(AUTOMATION_CONDITION_OPS),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
})

const actionSchema = z.object({
  type: z.enum(AUTOMATION_ACTION_TYPES),
  value: z.union([z.string(), z.number(), z.null()]),
})

const createSchema = z.object({
  name: z.string().min(1).max(100),
  triggerEventType: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/, 'must be dot-namespaced, e.g. "task.status_changed"'),
  conditions: z.array(conditionSchema).max(10).optional(),
  actions: z.array(actionSchema).min(1).max(10),
  enabled: z.boolean().default(true),
})

// Rules are workspace-wide behavior changes (reassigning work, changing
// priority, notifying people) — admin/manager only, same bar as projects.
export async function POST(req: NextRequest): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageWorkspaceConfig(ctx)) return forbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid rule', issues: parsed.error.issues }, { status: 400 })

  const [rule] = await db
    .insert(automationRules)
    .values({
      id: generateId(),
      workspaceId: ctx.workspaceId,
      name: parsed.data.name,
      triggerEventType: parsed.data.triggerEventType,
      conditions: parsed.data.conditions ?? null,
      actions: parsed.data.actions,
      enabled: parsed.data.enabled,
      createdByMemberId: ctx.member.id,
    })
    .returning()

  return Response.json({ rule }, { status: 201 })
}
