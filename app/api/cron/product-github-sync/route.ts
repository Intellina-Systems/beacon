import { type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { productGitHubRepositories, products } from '@/lib/db/schema'
import { syncProductGitHubRepository } from '@/lib/github/product-sync'

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production'
  }

  const authHeader = req.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const repositories = await db
      .select({
        repository: productGitHubRepositories,
        userId: products.userId,
      })
      .from(productGitHubRepositories)
      .innerJoin(products, eq(products.id, productGitHubRepositories.productId))
      .where(eq(productGitHubRepositories.syncEnabled, true))

    let repositoriesSynced = 0
    let repositoriesFailed = 0
    let pullRequestsSynced = 0
    let commitsSynced = 0
    let linksCreated = 0

    for (const row of repositories) {
      try {
        const result = await syncProductGitHubRepository(row.userId, row.repository)
        repositoriesSynced++
        pullRequestsSynced += result.pullRequestsSynced
        commitsSynced += result.commitsSynced
        linksCreated += result.linksCreated

        await db
          .update(productGitHubRepositories)
          .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
          .where(eq(productGitHubRepositories.id, row.repository.id))
      } catch {
        repositoriesFailed++
        console.error('[Product GitHub Cron] Repository sync failed')
      }
    }

    return Response.json({
      success: true,
      repositoriesSynced,
      repositoriesFailed,
      pullRequestsSynced,
      commitsSynced,
      linksCreated,
    })
  } catch {
    console.error('[Product GitHub Cron] Error occurred')
    return Response.json({ error: 'Cron sync failed' }, { status: 500 })
  }
}
