import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { productGitHubRepositories } from '@/lib/db/schema'
import { syncProductGitHubRepository } from '@/lib/github/product-sync'
import { getUserProduct } from '@/lib/products/access'
import { getServerSession } from '@/lib/session/get-server-session'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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

  let pullRequestsSynced = 0
  let commitsSynced = 0
  let linksCreated = 0

  try {
    for (const repository of repositories) {
      const result = await syncProductGitHubRepository(session.user.id, repository)
      pullRequestsSynced += result.pullRequestsSynced
      commitsSynced += result.commitsSynced
      linksCreated += result.linksCreated

      await db
        .update(productGitHubRepositories)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(productGitHubRepositories.id, repository.id))
    }

    return Response.json({
      success: true,
      repositoriesSynced: repositories.length,
      pullRequestsSynced,
      commitsSynced,
      linksCreated,
    })
  } catch {
    return Response.json({ error: 'GitHub sync failed' }, { status: 500 })
  }
}
