import { type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { productGitHubRepositories } from '@/lib/db/schema'
import { parseGitHubUrl } from '@/lib/github/client'
import { getGitHubApiErrorMessage, getGitHubRepositoryMetadata } from '@/lib/github/product-sync'
import { getUserProduct } from '@/lib/products/access'
import { getServerSession } from '@/lib/session/get-server-session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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
    .where(eq(productGitHubRepositories.productId, id))

  return Response.json({ repositories })
}

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

  const body = (await req.json()) as {
    repoUrl?: string
    owner?: string
    repo?: string
  }

  const parsed = body.repoUrl ? parseGitHubUrl(body.repoUrl.trim()) : null
  const owner = parsed?.owner ?? body.owner?.trim()
  const repo = parsed?.repo ?? body.repo?.trim()

  if (!owner || !repo) {
    return Response.json({ error: 'Repository is required' }, { status: 400 })
  }

  let metadata: Awaited<ReturnType<typeof getGitHubRepositoryMetadata>>
  try {
    metadata = await getGitHubRepositoryMetadata(owner, repo)
  } catch (error) {
    return Response.json({ error: getGitHubApiErrorMessage(error) }, { status: 400 })
  }

  if (!metadata) {
    return Response.json({ error: 'GitHub account not connected' }, { status: 401 })
  }

  const [repository] = await db
    .insert(productGitHubRepositories)
    .values({
      id: nanoid(),
      productId: id,
      owner: metadata.owner,
      repo: metadata.repo,
      repoUrl: metadata.repoUrl,
      defaultBranch: metadata.defaultBranch,
    })
    .onConflictDoUpdate({
      target: [productGitHubRepositories.productId, productGitHubRepositories.owner, productGitHubRepositories.repo],
      set: {
        repoUrl: metadata.repoUrl,
        defaultBranch: metadata.defaultBranch,
        syncEnabled: true,
        updatedAt: new Date(),
      },
    })
    .returning()

  return Response.json({ repository }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const product = await getUserProduct(id, session.user.id)
  if (!product) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const repositoryId = req.nextUrl.searchParams.get('repositoryId')
  if (!repositoryId) {
    return Response.json({ error: 'Repository is required' }, { status: 400 })
  }

  await db
    .delete(productGitHubRepositories)
    .where(and(eq(productGitHubRepositories.id, repositoryId), eq(productGitHubRepositories.productId, id)))

  return Response.json({ success: true })
}
