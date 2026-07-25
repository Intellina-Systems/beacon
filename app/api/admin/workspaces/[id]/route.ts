import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { workspaces } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { forbidden, isSuperAdminUser } from '@/lib/auth/permissions'

const deleteSchema = z.object({ confirmName: z.string().min(1) })

// Deletes the workspace row; every other table FKs to workspaces with
// onDelete: 'cascade', so this removes the entire org's data in one go.
// The typed-name confirmation guards against an accidental/scripted call —
// there's no undo once this runs.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdminUser(session.user.id))) return forbidden()

  const { id } = await params
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const [workspace] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, id)).limit(1)
  if (!workspace) return Response.json({ error: 'Not found' }, { status: 404 })
  if (parsed.data.confirmName !== workspace.name) {
    return Response.json({ error: 'Workspace name does not match' }, { status: 400 })
  }

  await db.delete(workspaces).where(eq(workspaces.id, id))
  return Response.json({ success: true })
}
