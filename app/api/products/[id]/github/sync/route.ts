import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { productGitHubRepositories } from '@/lib/db/schema'
import { getGitHubApiErrorMessage, syncProductGitHubRepository, type SyncProgressCallback } from '@/lib/github/product-sync'
import { getUserProduct } from '@/lib/products/access'
import { getServerSession } from '@/lib/session/get-server-session'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const product = await getUserProduct(id, session.user.id)
  if (!product) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const repositories = await db
    .select()
    .from(productGitHubRepositories)
    .where(and(eq(productGitHubRepositories.productId, id), eq(productGitHubRepositories.syncEnabled, true)))

  const body = await req.json().catch(() => ({})) as { since?: string | null }
  const since = body.since ? new Date(body.since) : undefined

  const userId = session.user.id
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      let pullRequestsSynced = 0
      let commitsSynced = 0
      let linksCreated = 0

      try {
        for (const repository of repositories) {
          send('repo_start', { owner: repository.owner, repo: repository.repo })

          try {
            const onProgress: SyncProgressCallback = (event) => {
              send('repo_progress', { owner: repository.owner, repo: repository.repo, ...event })
            }
            const result = await syncProductGitHubRepository(userId, repository, since, onProgress)
            pullRequestsSynced += result.pullRequestsSynced
            commitsSynced += result.commitsSynced
            linksCreated += result.linksCreated

            await db
              .update(productGitHubRepositories)
              .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
              .where(eq(productGitHubRepositories.id, repository.id))

            send('repo_done', {
              owner: repository.owner,
              repo: repository.repo,
              pullRequestsSynced: result.pullRequestsSynced,
              commitsSynced: result.commitsSynced,
              linksCreated: result.linksCreated,
            })
          } catch (error) {
            send('repo_error', {
              owner: repository.owner,
              repo: repository.repo,
              message: getGitHubApiErrorMessage(error),
            })
          }
        }

        send('done', {
          repositoriesSynced: repositories.length,
          pullRequestsSynced,
          commitsSynced,
          linksCreated,
        })
      } catch (error) {
        send('error', { message: getGitHubApiErrorMessage(error) })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
