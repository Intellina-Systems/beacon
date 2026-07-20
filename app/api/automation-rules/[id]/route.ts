import { and, eq } from 'drizzle-orm'
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
import { canViewAllTeams, forbidden } from '@/lib/auth/permissions'

const conditionSchema = z.object({
  field: z.enum(AUTOMATION_CONDITION_FIELDS),
  op: z.enum(AUTOMATION_CONDITION_OPS),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
})

const actionSchema = z.object({
  type: z.enum(AUTOMATION_ACTION_TYPES),
  value: z.union([z.string(), z.number(), z.null()]),
})

const patchSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    triggerEventType: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/)
      .optional(),
    conditions: z.array(conditionSchema).max(10).nullable().optional(),
    actions: z.array(actionSchema).min(1).max(10).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Empty update' })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canViewAllTeams(ctx)) return forbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid update', issues: parsed.error.issues }, { status: 400 })

  const { id } = await params
  const [rule] = await db
    .update(automationRules)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(automationRules.id, id), eq(automationRules.workspaceId, ctx.workspaceId)))
    .returning()

  if (!rule) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ rule })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canViewAllTeams(ctx)) return forbidden()

  const { id } = await params
  const [deleted] = await db
    .delete(automationRules)
    .where(and(eq(automationRules.id, id), eq(automationRules.workspaceId, ctx.workspaceId)))
    .returning({ id: automationRules.id })

  if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
