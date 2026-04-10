import { type NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { linearConnections, projects, workItems, members } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { decrypt } from '@/lib/crypto'
import { getServerSession } from '@/lib/session/get-server-session'
import { getLinearProjects, getLinearProjectIssues, getLinearUsers } from '@/lib/linear/client'

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // Get Linear connection
  const [connection] = await db.select().from(linearConnections).where(eq(linearConnections.userId, userId)).limit(1)

  if (!connection) {
    return Response.json({ error: 'No Linear connection found' }, { status: 404 })
  }

  const accessToken = decrypt(connection.accessToken)

  try {
    // Sync projects
    const linearProjectList = await getLinearProjects(accessToken)

    let projectsSynced = 0
    let issuesSynced = 0

    for (const lp of linearProjectList) {
      const teamId = lp.teams.nodes[0]?.id ?? null

      // Upsert project
      const existingProjects = await db.select().from(projects).where(eq(projects.linearProjectId, lp.id)).limit(1)

      let projectId: string

      if (existingProjects.length > 0) {
        projectId = existingProjects[0].id
        await db
          .update(projects)
          .set({
            name: lp.name,
            description: lp.description,
            linearTeamId: teamId,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId))
      } else {
        projectId = nanoid()
        await db.insert(projects).values({
          id: projectId,
          userId,
          name: lp.name,
          description: lp.description,
          linearProjectId: lp.id,
          linearTeamId: teamId,
        })
      }

      projectsSynced++

      // Sync issues for this project
      const issues = await getLinearProjectIssues(accessToken, lp.id)

      for (const issue of issues) {
        const existingItems = await db.select().from(workItems).where(eq(workItems.linearId, issue.id)).limit(1)

        const dueDate = issue.dueDate ? new Date(issue.dueDate) : null

        if (existingItems.length > 0) {
          await db
            .update(workItems)
            .set({
              title: issue.title,
              description: issue.description,
              status: issue.state.name,
              statusType: issue.state.type,
              priority: issue.priority,
              assigneeLinearId: issue.assignee?.id ?? null,
              assigneeName: issue.assignee?.name ?? null,
              linearUrl: issue.url,
              dueDate,
              updatedAt: new Date(),
            })
            .where(eq(workItems.id, existingItems[0].id))
        } else {
          await db.insert(workItems).values({
            id: nanoid(),
            projectId,
            title: issue.title,
            description: issue.description,
            status: issue.state.name,
            statusType: issue.state.type,
            priority: issue.priority,
            assigneeLinearId: issue.assignee?.id ?? null,
            assigneeName: issue.assignee?.name ?? null,
            linearId: issue.id,
            linearUrl: issue.url,
            source: 'linear',
            dueDate,
          })
        }

        issuesSynced++
      }
    }

    // Sync team members
    const linearUsers = await getLinearUsers(accessToken)

    for (const lu of linearUsers) {
      const existingMembers = await db.select().from(members).where(eq(members.linearUserId, lu.id)).limit(1)

      if (existingMembers.length > 0) {
        await db
          .update(members)
          .set({
            name: lu.name,
            email: lu.email,
            avatarUrl: lu.avatarUrl,
            updatedAt: new Date(),
          })
          .where(eq(members.id, existingMembers[0].id))
      } else {
        await db.insert(members).values({
          id: nanoid(),
          userId,
          name: lu.name,
          email: lu.email,
          avatarUrl: lu.avatarUrl,
          linearUserId: lu.id,
        })
      }
    }

    return Response.json({
      success: true,
      projectsSynced,
      issuesSynced,
      membersSynced: linearUsers.length,
    })
  } catch (err) {
    console.error('[Linear Sync] Error:', err)
    return Response.json({ error: 'Sync failed' }, { status: 500 })
  }
}
